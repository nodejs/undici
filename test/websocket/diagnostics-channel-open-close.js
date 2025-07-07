'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('diagnostics channel - undici:websocket:[open/close]', async (t) => {
  const { equal, completed } = tspl(t, { plan: 6 })

  const server = new WebSocketServer({ port: 0 })
  const { port } = server.address()
  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  server.on('connection', (ws) => {
    ws.close(1000, 'goodbye')
  })

  const openListener = ({ extensions, protocol, websocket }) => {
    equal(extensions, '')
    equal(protocol, 'chat')
    equal(websocket, ws)
  }

  const closeListener = ({ websocket, code, reason }) => {
    equal(code, 1000)
    equal(reason, 'goodbye')
    equal(websocket, ws)
  }

  dc.channel('undici:websocket:open').subscribe(openListener)
  dc.channel('undici:websocket:close').subscribe(closeListener)

  t.after(() => {
    server.close()
    dc.channel('undici:websocket:open').unsubscribe(openListener)
    dc.channel('undici:websocket:close').unsubscribe(closeListener)
  })

  await completed
})
