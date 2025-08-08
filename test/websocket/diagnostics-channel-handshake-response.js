'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('diagnostics channel - undici:websocket:open includes handshake response', async (t) => {
  const { equal, ok, completed } = tspl(t, { plan: 3 })

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()
  console.log('[TEST] WebSocketServer started on port', port)

  server.on('connection', (ws) => {
    console.log('[TEST] Server: connection established')
    setTimeout(() => {
      ws.close(1000, 'test')
      console.log('[TEST] Server: connection closed')
    }, 50)
  })

  const openListener = (data) => {
    console.log('[TEST] openListener called:', data)
    // Verify handshake response data
    ok(data.handshakeResponse, 'handshakeResponse should be defined')
    equal(data.handshakeResponse.status, 101, 'status should be 101')
    equal(data.handshakeResponse.statusText, 'Switching Protocols', 'statusText should be correct')
  }

  dc.channel('undici:websocket:open').subscribe(openListener)

  t.after(() => {
    server.close()
    dc.channel('undici:websocket:open').unsubscribe(openListener)
    console.log('[TEST] Cleanup complete')
  })

  // Create WebSocket connection
  const ws = new WebSocket(`ws://localhost:${port}`)
  console.log('[TEST] WebSocket client created:', ws.url)

  // Ensure connection is created (avoid no-new linting error)
  ws.url // eslint-disable-line no-unused-expressions

  await completed
})
