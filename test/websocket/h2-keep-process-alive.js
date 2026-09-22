'use strict'

const { test } = require('node:test')
const { fork } = require('node:child_process')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { join } = require('node:path')
const { WebSocket: WSWebSocket } = require('ws')
const { key, cert } = require('@metcoder95/https-pem')
const { uid } = require('../../lib/web/websocket/constants')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const crypto = runtimeFeatures.has('crypto')
  ? require('node:crypto')
  : null

// An open WebSocket over h2 must keep the process alive even though the handshake
// completed its request and left the queue empty. The server sends only after the
// child reports 'open': an unref'd session would let the child exit before that.
async function runClient (t, beforeSend = (stream, send) => send()) {
  const server = createSecureServer({ key, cert, settings: { enableConnectProtocol: true } })
  t.after(() => server.close())

  let serverStream
  let serverWs
  server.on('stream', (stream, headers) => {
    stream.respond({
      ':status': 200,
      'sec-websocket-accept': crypto.hash('sha1', `${headers['sec-websocket-key']}${uid}`, 'base64')
    })

    serverStream = stream
    serverWs = new WSWebSocket(null, null, { autoPong: true })
    serverWs.setSocket(stream, Buffer.alloc(0), {
      maxPayload: 104857600,
      skipUTF8Validation: false
    })
  })

  server.listen(0)
  await once(server, 'listening')

  const child = fork(join(__dirname, '../fixtures/websocket-h2-client.js'), [String(server.address().port)])
  t.after(() => child.kill())

  const messages = []
  child.on('message', (message) => {
    messages.push(message)

    if (message === 'open') {
      beforeSend(serverStream, () => {
        serverWs.send('hello')
        serverWs.close(1000)
      })
    }
  })

  const [code, signal] = await once(child, 'close')

  t.assert.strictEqual(signal, null)
  t.assert.strictEqual(code, 0)
  t.assert.deepStrictEqual(messages, ['open', 'hello', { code: 1000, wasClean: true }])
}

const options = { skip: crypto == null, timeout: 10000 }

test('an open WebSocket over H2 keeps the process alive', options, async (t) => {
  await runClient(t)
})

// SETTINGS_MAX_CONCURRENT_STREAMS = 0 leaves the open stream alone, so it must not
// unref the session either. The settings callback fires on the child's ACK.
test('an open WebSocket over H2 keeps the process alive after the peer stops allowing new streams', options, async (t) => {
  await runClient(t, (stream, send) => stream.session.settings({ maxConcurrentStreams: 0 }, send))
})
