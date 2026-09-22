'use strict'

// Regression test for https://github.com/nodejs/undici/issues/4989
//
// Importing undici v8 sets a global dispatcher (including the legacy
// Symbol.for('undici.globalDispatcher.1') used by Node.js's bundled undici).
// The new Agent defaults allowH2 → true, so TLS ALPN negotiates h2.
// Undici v8's own fetch has a dispatchWithProtocolPreference fallback that
// retries with allowH2: false when Extended CONNECT is unavailable, but
// Node.js's bundled undici fetch does NOT have this fallback.
// As a result, globalThis.WebSocket (backed by the bundled undici) breaks
// when connecting to servers that advertise h2 but don't support RFC 8441.

const { test } = require('node:test')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')

const { tspl } = require('@matteo.collina/tspl')
const { WebSocketServer } = require('ws')
const { key, cert } = require('@metcoder95/https-pem')

// Self-signed certs require this since native WebSocket uses the
// bundled dispatcher which has no rejectUnauthorized override.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

// Importing undici sets the global dispatcher — this is what triggers the bug.
require('../..')

test('globalThis.WebSocket connects to h2+http1.1 server after undici import', async (t) => {
  const planner = tspl(t, { plan: 2 })

  // HTTP/2 server with HTTP/1.1 fallback.
  // Advertises h2 in ALPN but does NOT enable Extended CONNECT (RFC 8441).
  // WebSocket must fall back to HTTP/1.1 upgrade.
  const server = createSecureServer({ cert, key, allowHTTP1: true })
  const wsServer = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req)
    })
  })

  wsServer.on('connection', (ws) => {
    ws.send('hello')
  })

  server.listen(0)
  await once(server, 'listening')

  t.after(async () => {
    await new Promise((resolve) => wsServer.close(resolve))
    await new Promise((resolve) => server.close(resolve))
  })

  // globalThis.WebSocket is Node.js's native WebSocket (backed by bundled undici).
  // It reads the global dispatcher set by the undici v8 import above.
  const ws = new globalThis.WebSocket(`wss://localhost:${server.address().port}`)

  await Promise.race([
    new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        planner.ok(true, 'connection opened')
      })
      ws.addEventListener('message', (evt) => {
        planner.strictEqual(evt.data, 'hello')
        ws.close()
        resolve()
      })
      ws.addEventListener('error', () => {
        reject(new Error('native WebSocket failed — global dispatcher h2 not falling back'))
      })
    }),
    new Promise((_resolve, reject) =>
      setTimeout(() => reject(new Error('Timeout after 5s')), 5000)
    )
  ])

  await planner.completed
})
