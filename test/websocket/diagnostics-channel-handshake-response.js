'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { once } = require('node:events')

test('diagnostics channel - undici:websocket:open includes handshake response', async (t) => {
  t.plan(11)

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()

  server.on('connection', (ws) => {
    setTimeout(() => {
      ws.close(1000, 'test')
    }, 50)
  })

  const openListener = (data) => {
    // Verify handshake response data
    t.assert.ok(data.handshakeResponse, 'handshakeResponse should be defined')
    t.assert.strictEqual(data.handshakeResponse.status, 101, 'status should be 101')
    t.assert.strictEqual(data.handshakeResponse.statusText, 'Switching Protocols', 'statusText should be correct')
    // Check handshake response headers
    const headers = data.handshakeResponse.headers
    t.assert.ok(headers, 'headers should be defined')
    t.assert.ok(typeof headers === 'object', 'headers should be an object')
    t.assert.ok('upgrade' in headers, 'upgrade header should be present')
    t.assert.ok('connection' in headers, 'connection header should be present')
    t.assert.ok('sec-websocket-accept' in headers, 'sec-websocket-accept header should be present')
    // Optionally, check values
    t.assert.strictEqual(headers.upgrade.toLowerCase(), 'websocket', 'upgrade header should be websocket')
    t.assert.strictEqual(headers.connection.toLowerCase(), 'upgrade', 'connection header should be upgrade')
    t.assert.ok(typeof headers['sec-websocket-accept'] === 'string', 'sec-websocket-accept header should be a string')
  }

  dc.channel('undici:websocket:open').subscribe(openListener)

  t.after(() => {
    server.close()
    dc.channel('undici:websocket:open').unsubscribe(openListener)
  })

  // Create WebSocket connection

  const _ws = new WebSocket(`ws://localhost:${port}`)

  await once(_ws, 'open')
})
