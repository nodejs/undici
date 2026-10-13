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

const ping = Buffer.from([0x89, 0x00])
const emptyContinuation = Buffer.from([0x80, 0x00])
// Close frame with status 1000
const close = Buffer.from([0x88, 0x02, 0x03, 0xE8])

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

test('a continuation frame after a compressed message fails the connection', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    // A complete compressed text message: FIN, RSV1, opcode 0x1.
    frame(0xC1, payload),
    // No fragmented message is in progress, so this continuation frame must
    // fail the connection rather than start a new message.
    emptyContinuation
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:Unexpected continuation frame'])
})

test('a continuation frame after an uncompressed message fails the connection', async (t) => {
  const events = await exchange(t, [
    // A complete text message "hello": FIN, opcode 0x1.
    frame(0x81, Buffer.from('hello')),
    emptyContinuation
  ], { perMessageDeflate: false })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:Unexpected continuation frame'])
})

test('a fragmented compressed message is assembled', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    // Compressed text frame, not final: RSV1, opcode 0x1.
    frame(0x41, payload.subarray(0, 2)),
    // Final continuation frame: the message is in progress, so this is legal.
    frame(0x80, payload.subarray(2)),
    close
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'close:1000'])
  t.assert.deepStrictEqual(events.server, ['close:1000:'])
})

test('a continuation frame after a multi-fragment compressed message fails the connection', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    frame(0x41, payload.subarray(0, 2)),
    frame(0x80, payload.subarray(2)),
    emptyContinuation
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:Unexpected continuation frame'])
})

test('a continuation frame separated from a compressed message by a ping fails the connection', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    frame(0xC1, payload),
    // The ping is answered, but it must not launder the stray continuation
    // frame that follows it.
    ping,
    emptyContinuation
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['pong', 'close:1002:Unexpected continuation frame'])
})

test('a non-empty continuation frame after a compressed message fails the connection', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    frame(0xC1, payload),
    // The stray continuation carries a payload that would decompress cleanly,
    // so the connection must fail on the frame's opcode, not on a zlib error.
    frame(0x80, payload)
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'error', 'close:1006'])
  t.assert.deepStrictEqual(events.server, ['close:1002:Unexpected continuation frame'])
})

test('two consecutive compressed messages are delivered', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    frame(0xC1, payload),
    frame(0xC1, payload),
    close
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'message:hello', 'close:1000'])
  t.assert.deepStrictEqual(events.server, ['close:1000:'])
})

test('a ping inside a fragmented compressed message leaves the message intact', async (t) => {
  const payload = await deflate(Buffer.from('hello'))

  const events = await exchange(t, [
    frame(0x41, payload.subarray(0, 2)),
    // Control frames may be interleaved into a fragmented message.
    ping,
    frame(0x80, payload.subarray(2)),
    close
  ], { perMessageDeflate: true })

  t.assert.deepStrictEqual(events.client, ['message:hello', 'close:1000'])
  t.assert.deepStrictEqual(events.server, ['pong', 'close:1000:'])
})
