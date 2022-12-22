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

test('Multiple protocols are joined by a comma', (t) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws, req) => {
    t.equal(req.headers['sec-websocket-protocol'], 'chat, echo')

    ws.close(1000)
    server.close()
  })

  t.teardown(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`, ['chat', 'echo'])

  ws.addEventListener('open', () => ws.close())
})

test('Server doesn\'t send Sec-WebSocket-Protocol header when protocols are used', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.statusCode = 101

    req.socket.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})

test('Server sends invalid Upgrade header', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'NotWebSocket')
    res.statusCode = 101

    req.socket.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})

test('Server sends invalid Connection header', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'downgrade')
    res.statusCode = 101

    req.socket.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Accept header', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', 'abc')
    res.statusCode = 101

    req.socket.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Extensions header', (t) => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const { createHash } = require('crypto')

  t.plan(2)

  const server = createServer((req, res) => {
    const key = req.headers['sec-websocket-key']
    t.ok(key)

    const accept = createHash('sha1').update(key + uid).digest('base64')

    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', accept)
    res.setHeader('Sec-WebSocket-Extensions', 'InvalidExtension')
    res.statusCode = 101

    res.end()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Extensions header', (t) => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const { createHash } = require('crypto')

  t.plan(2)

  const server = createServer((req, res) => {
    const key = req.headers['sec-websocket-key']
    t.ok(key)

    const accept = createHash('sha1').update(key + uid).digest('base64')

    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', accept)
    res.setHeader('Sec-WebSocket-Protocol', 'echo') // <--
    res.statusCode = 101

    res.end()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

    ws.onopen = t.fail

    ws.addEventListener('error', ({ error }) => {
      t.ok(error)
    })
  })

  t.teardown(server.close.bind(server))
})
