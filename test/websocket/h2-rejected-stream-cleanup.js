'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { key, cert } = require('@metcoder95/https-pem')
const { Agent, WebSocket } = require('../..')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

for (const responseHeaders of [
  { ':status': 200 },
  { ':status': 200, 'sec-websocket-protocol': 'chat', 'sec-websocket-accept': 'invalid' }
]) {
  test('a rejected H2 WebSocket handshake closes its stream', { skip: !runtimeFeatures.has('crypto'), timeout: 10000 }, async (t) => {
    const server = createSecureServer({ key, cert, settings: { enableConnectProtocol: true } })
    const sessions = new Set()
    let closeStream
    const streamClosed = new Promise((resolve) => { closeStream = resolve })

    server.on('session', (session) => {
      sessions.add(session)
      session.on('close', () => sessions.delete(session))
    })
    server.on('stream', (stream) => {
      stream.on('error', () => {})
      stream.once('close', closeStream)
      stream.respond(responseHeaders)
      // Leave the stream open: the client must close it after rejecting the handshake.
    })

    server.listen(0)
    await once(server, 'listening')
    const dispatcher = new Agent({ allowH2: true, connect: { rejectUnauthorized: false } })
    t.after(async () => {
      for (const session of sessions) session.destroy()
      await new Promise((resolve) => server.close(resolve))
      await dispatcher.close()
    })

    const ws = new WebSocket(`wss://localhost:${server.address().port}`, { dispatcher, protocols: ['chat'] })
    ws.addEventListener('error', () => {})
    ws.addEventListener('open', () => t.assert.fail('handshake should be rejected'))
    const [close] = await once(ws, 'close')
    t.assert.strictEqual(close.code, 1006)

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('H2 stream remained open after WebSocket closed')), 1000)
      streamClosed.then(() => { clearTimeout(timer); resolve() })
    })
  })
}
