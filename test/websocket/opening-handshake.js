'use strict'

const { test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('http')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('WebSocket connecting to server that isn\'t a Websocket server', () => {
  const server = createServer((req, res) => {
    asserassert.equal(req.headers.connection, 'upgrade')
    asserassert.equal(req.headers.upgrade, 'websocket')
    asserassert.ok(req.headers['sec-websocket-key'])
    asserassert.equal(req.headers['sec-websocket-version'], '13')

    res.end()
    server.unref()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    // Server isn't a websocket server
    ws.onmessage = ws.onopen = assert.fail

    ws.addEventListener('error', assert.pass)
  })

  after(server.close.bind(server))
})

test('Open event is emitted', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.close(1000)
  })

  after(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.onmessage = ws.onerror = assert.fail
  ws.addEventListener('open', assert.pass)
})

test('Multiple protocols are joined by a comma', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws, req) => {
    asserassert.equal(req.headers['sec-websocket-protocol'], 'chat, echo')

    ws.close(1000)
    server.close()
  })

  after(server.close.bind(server))

  const ws = new WebSocket(`ws://localhost:${server.address().port}`, ['chat', 'echo'])

  ws.addEventListener('open', () => ws.close())
})

test('Server doesn\'t send Sec-WebSocket-Protocol header when protocols are used', () => {
  const server = createServer((req, res) => {
    res.statusCode = 101

    req.sockeassert.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

    ws.onopen = asserassert.fail

    ws.addEventListener('error', ({ error }) => {
      asserassert.ok(error)
    })
  })

  after(server.close.bind(server))
})

test('Server sends invalid Upgrade header', () => {
  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'NotWebSocket')
    res.statusCode = 101

    req.sockeassert.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = asserassert.fail

    ws.addEventListener('error', ({ error }) => {
      asserassert.ok(error)
    })
  })

  after(server.close.bind(server))
})

test('Server sends invalid Connection header', () => {
  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'downgrade')
    res.statusCode = 101

    req.sockeassert.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = asserassert.fail

    ws.addEventListener('error', ({ error }) => {
      asserassert.ok(error)
    })
  })

  after(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Accept header', () => {
  const server = createServer((req, res) => {
    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', 'abc')
    res.statusCode = 101

    req.sockeassert.destroy()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = asserassert.fail

    ws.addEventListener('error', ({ error }) => {
      asserassert.ok(error)
    })
  })

  after(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Extensions header', () => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const { createHash } = require('crypto')

  const server = createServer((req, res) => {
    const key = req.headers['sec-websocket-key']
    assert.ok(key)

    const accept = createHash('sha1').update(key + uid).digest('base64')

    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', accept)
    res.setHeader('Sec-WebSocket-Extensions', 'InvalidExtension')
    res.statusCode = 101

    res.end()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onopen = assert.fail

    ws.addEventListener('error', ({ error }) => {
      assert.ok(error)
    })
  })

  after(server.close.bind(server))
})

test('Server sends invalid Sec-WebSocket-Extensions header', () => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const { createHash } = require('crypto')

  const server = createServer((req, res) => {
    const key = req.headers['sec-websocket-key']
    assert.ok(key)

    const accept = createHash('sha1').update(key + uid).digest('base64')

    res.setHeader('Upgrade', 'websocket')
    res.setHeader('Connection', 'upgrade')
    res.setHeader('Sec-WebSocket-Accept', accept)
    res.setHeader('Sec-WebSocket-Protocol', 'echo') // <--
    res.statusCode = 101

    res.end()
  }).listen(0, () => {
    const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

    ws.onopen = assert.fail

    ws.addEventListener('error', ({ error }) => {
      assert.ok(error)
    })
  })

  after(server.close.bind(server))
})
