'use strict'

const { test } = require('tap')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('WebSocket connecting to server that isn\'t a Websocket server', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.equal(req.headers.connection, 'upgrade')
    t.equal(req.headers.upgrade, 'websocket')
    t.ok(req.headers['sec-websocket-key'])
    t.equal(req.headers['sec-websocket-version'], '13')

    res.end()
    server.unref()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    // Server isn't a websocket server
    ws.onmessage = ws.onopen = t.fail

    ws.addEventListener('error', t.pass)
  })

  t.teardown(server.close.bind(server))
})

test('Open event is emitted', (t) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.close(1000)
  })

  t.teardown(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.onmessage = ws.onerror = t.fail
  ws.addEventListener('open', t.pass)
})
