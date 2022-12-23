'use strict'

const t = require('tap')
const dc = require('diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

t.test('diagnostics channel', { jobs: 1 }, (t) => {
  t.plan(2)

  t.test('undici:websocket:open', (t) => {
    t.plan(3)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000, 'goodbye')
    })

    const listener = ({ extensions, protocol }) => {
      t.equal(extensions, null)
      t.equal(protocol, 'chat')
    }

    t.teardown(() => {
      dc.channel('undici:websocket:open').unsubscribe(listener)
      return server.close()
    })

    const { port } = server.address()

    dc.channel('undici:websocket:open').subscribe(listener)

    const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

    ws.addEventListener('open', () => {
      t.pass('Emitted open')
    })
  })

  t.test('undici:websocket:close', (t) => {
    t.plan(4)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000, 'goodbye')
    })

    const listener = ({ websocket, code, reason }) => {
      t.type(websocket, WebSocket)
      t.equal(code, 1000)
      t.equal(reason, 'goodbye')
    }

    t.teardown(() => {
      dc.channel('undici:websocket:close').unsubscribe(listener)
      return server.close()
    })

    const { port } = server.address()

    dc.channel('undici:websocket:close').subscribe(listener)

    const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

    ws.addEventListener('close', () => {
      t.pass('Emitted open')
    })
  })
})
