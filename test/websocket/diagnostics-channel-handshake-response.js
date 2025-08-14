'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('diagnostics channel - undici:websocket:open includes handshake response', async (t) => {
  const { equal, ok, completed } = tspl(t, { plan: 11 })

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()

  server.on('connection', (ws) => {
    setTimeout(() => {
      ws.close(1000, 'test')
    }, 50)
  })

  const openListener = (data) => {
    // Verify handshake response data
    ok(data.handshakeResponse, 'handshakeResponse should be defined')
    equal(data.handshakeResponse.status, 101, 'status should be 101')
    equal(data.handshakeResponse.statusText, 'Switching Protocols', 'statusText should be correct')
    // Check handshake response headers
    const headers = data.handshakeResponse.headers
    ok(headers, 'headers should be defined')
    ok(typeof headers === 'object', 'headers should be an object')
    ok('upgrade' in headers, 'upgrade header should be present')
    ok('connection' in headers, 'connection header should be present')
    ok('sec-websocket-accept' in headers, 'sec-websocket-accept header should be present')
    // Optionally, check values
    equal(headers.upgrade.toLowerCase(), 'websocket', 'upgrade header should be websocket')
    equal(headers.connection.toLowerCase(), 'upgrade', 'connection header should be upgrade')
    ok(typeof headers['sec-websocket-accept'] === 'string', 'sec-websocket-accept header should be a string')
  }

  dc.channel('undici:websocket:open').subscribe(openListener)

  t.after(() => {
    server.close()
    dc.channel('undici:websocket:open').unsubscribe(openListener)
  })

  // Create WebSocket connection
  // eslint-disable-next-line no-unused-vars
  const _ws = new WebSocket(`ws://localhost:${port}`)

  await completed
})
