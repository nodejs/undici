'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createDeflateRaw, constants, deflateRawSync } = require('node:zlib')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

const tail = Buffer.from([0x00, 0x00, 0xff, 0xff])
const close = Buffer.from([0x88, 0x02, 0x03, 0xe8])

// RFC 7692 §7.2.3.4: one BFINAL block, then a non-final empty-block header.
function bfinalPayload (text) {
  return Buffer.concat([deflateRawSync(text), Buffer.from([0x00])])
}

function frame (payload) {
  return Buffer.concat([Buffer.from([0xc1, payload.length]), payload])
}

function deflateSyncFlush (text) {
  return new Promise((resolve) => {
    const deflateRaw = createDeflateRaw()
    const chunks = []

    deflateRaw.on('data', (chunk) => chunks.push(chunk))
    deflateRaw.write(text)
    deflateRaw.flush(constants.Z_SYNC_FLUSH, () => {
      const output = Buffer.concat(chunks)
      resolve(output.subarray(0, output.length - tail.length))
    })
  })
}

async function exchange (t, frames, perMessageDeflate = true) {
  const server = new WebSocketServer({ port: 0, perMessageDeflate })
  await once(server, 'listening')
  t.after(() => server.close())

  const messages = []
  let error = false
  let code

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  client.addEventListener('message', (event) => messages.push(String(event.data)))
  client.addEventListener('error', () => {
    error = true
  })
  client.addEventListener('close', (event) => {
    code = event.code
  })

  const [peer] = await once(server, 'connection')
  const closed = Promise.all([once(peer, 'close'), once(client, 'close')])

  for (const part of frames) {
    peer._socket.write(part)
  }

  await closed
  return { messages, error, code, extensions: client.extensions }
}

test('BFINAL messages still decode when the server disables context takeover', async (t) => {
  const texts = ['hello from msg1', 'world from msg2', 'third message here']
  const frames = texts.map((text) => frame(bfinalPayload(text)))
  frames.push(close)

  const result = await exchange(t, frames, { serverNoContextTakeover: true })

  t.assert.match(result.extensions, /server_no_context_takeover/)
  t.assert.deepStrictEqual(result.messages, texts)
  t.assert.strictEqual(result.error, false)
  t.assert.strictEqual(result.code, 1000)
})

test('a BFINAL permessage-deflate block does not blank later messages', async (t) => {
  const texts = ['hello from msg1', 'world from msg2', 'third message here']
  const frames = texts.map((text) => frame(bfinalPayload(text)))
  frames.push(frame(await deflateSyncFlush('after')))
  frames.push(close)

  const result = await exchange(t, frames)

  t.assert.deepStrictEqual(result.messages, [...texts, 'after'])
  t.assert.strictEqual(result.error, false)
  t.assert.strictEqual(result.code, 1000)
})

test('sync-flush messages keep the permessage-deflate sliding window', async (t) => {
  const deflateRaw = createDeflateRaw()
  const chunks = []
  const messages = []

  deflateRaw.on('data', (chunk) => chunks.push(chunk))

  const text = 'hello hello hello hello '
  for (let i = 0; i < 2; i++) {
    chunks.length = 0
    deflateRaw.write(text)
    await new Promise((resolve) => {
      deflateRaw.flush(constants.Z_SYNC_FLUSH, () => resolve())
    })
    const output = Buffer.concat(chunks)
    messages.push(output.subarray(0, output.length - tail.length))
  }

  // The second block is only valid against the first message's window.
  t.assert.ok(messages[1].length < deflateRawSync(text).length)

  const result = await exchange(t, [
    frame(messages[0]),
    frame(messages[1]),
    close
  ])

  t.assert.deepStrictEqual(result.messages, [text, text])
  t.assert.strictEqual(result.error, false)
  t.assert.strictEqual(result.code, 1000)
})
