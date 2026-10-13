'use strict'

const assert = require('node:assert/strict')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { key, cert } = require('@metcoder95/https-pem')
const { Agent, WebSocket } = require('../..')

async function main () {
  let session
  let receivedConnect = false
  const server = createSecureServer({ key, cert, settings: { enableConnectProtocol: true } })
  server.on('session', (s) => { session = s })
  server.on('stream', (stream) => {
    receivedConnect = true
    stream.on('error', () => {})
    // The status is accepted for H2, but the protocol is missing or unexpected.
    // Keep the stream open until after WebSocket has reported the failure.
    stream.respond(process.argv[2] === 'wrong-protocol'
      ? { ':status': 200, 'sec-websocket-protocol': 'echo' }
      : { ':status': 200 })
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent({ allowH2: true, connect: { rejectUnauthorized: false } })
  const ws = new WebSocket(`wss://localhost:${server.address().port}`, { dispatcher, protocols: ['chat'] })
  ws.addEventListener('error', () => {})
  ws.addEventListener('open', () => { throw new Error('unexpected WebSocket open') })
  const [event] = await once(ws, 'close')
  assert.strictEqual(receivedConnect, true)
  assert.strictEqual(event.code, 1006)

  // Closing the session must not surface an unhandled error on an orphaned stream.
  session.destroy()
  await new Promise((resolve) => server.close(resolve))
  await dispatcher.close()
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
