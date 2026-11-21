'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createDeflateRaw, constants } = require('node:zlib')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

/**
 * Compresses `data` the way a permessage-deflate peer does: deflate raw, sync
 * flush, and strip the trailing 0x00 0x00 0xff 0xff octets.
 * @param {Buffer} data
 * @returns {Promise<Buffer>}
 */
function deflate (data) {
  return new Promise((resolve) => {
    const deflateRaw = createDeflateRaw()
    const chunks = []

    deflateRaw.on('data', (chunk) => chunks.push(chunk))
    deflateRaw.write(data)
    deflateRaw.flush(constants.Z_SYNC_FLUSH, () => {
      const output = Buffer.concat(chunks)
      resolve(output.subarray(0, output.length - 4))
    })
  })
}

/**
 * Builds an unmasked server-to-client frame with a payload of at most 125 bytes.
 * @param {number} header FIN, RSV and opcode bits
 * @param {Buffer} payload
 * @returns {Buffer}
 */
function frame (header, payload) {
  return Buffer.concat([Buffer.from([header, payload.length]), payload])
}

async function exchange (t, frames, { perMessageDeflate }) {
  const server = new WebSocketServer({ port: 0, perMessageDeflate })
  await once(server, 'listening')
  t.after(() => server.close())

  const events = { client: [], server: [] }

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  client.addEventListener('message', ({ data }) => events.client.push(`message:${data}`))
  client.addEventListener('error', () => events.client.push('error'))
  client.addEventListener('close', ({ code }) => events.client.push(`close:${code}`))

  const [peer] = await once(server, 'connection')
  peer.on('pong', () => events.server.push('pong'))
  peer.on('close', (code, reason) => events.server.push(`close:${code}:${reason}`))

  const closed = Promise.all([once(peer, 'close'), once(client, 'close')])

  for (const frame of frames) {
    peer._socket.write(frame)
  }

  await closed

  return events
}

test('a control frame with RSV1 set fails the connection', async (t) => {
  const events = await exchange(t, [
    // Ping with FIN and RSV1 set: 0x80 | 0x40 | 0x09. RSV1 is only defined for
    // the first frame of a data message, so it must be rejected here instead of
    // answered with a pong.
    frame(0xC9, Buffer.alloc(0))
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:RSV1 must be clear for control and continuation frames'])
})

test('a continuation frame with RSV1 set fails the connection', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    // First frame of a fragmented compressed message: FIN clear, RSV1 set.
    frame(0x41, payload.subarray(0, 2)),
    // Continuation frame that illegally carries RSV1 (0x80 | 0x40 | 0x00). The
    // message must fail rather than be assembled and delivered.
    frame(0xC0, payload.subarray(2))
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:RSV1 must be clear for control and continuation frames'])
})
