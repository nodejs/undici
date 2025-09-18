'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

test('WebSocket connecting to server that isn\'t a Websocket server', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      assert.equal(req.headers.connection, 'upgrade')
      assert.equal(req.headers.upgrade, 'websocket')
      assert.ok(req.headers['sec-websocket-key'])
      assert.equal(req.headers['sec-websocket-version'], '13')

      res.end()
      server.unref()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      // Server isn't a websocket server
      ws.onmessage = ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Open event is emitted', () => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000)
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.onmessage = ws.onerror = reject
    ws.addEventListener('open', () => {
      server.close()
      resolve()
    })
  })
})

test('Multiple protocols are joined by a comma', () => {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws, req) => {
      assert.equal(req.headers['sec-websocket-protocol'], 'chat, echo')

      ws.close(1000)
      server.close()
      resolve()
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`, ['chat', 'echo'])
    ws.addEventListener('open', () => ws.close())
  })
})

test('Server doesn\'t send Sec-WebSocket-Protocol header when protocols are used', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Upgrade header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'NotWebSocket')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Connection header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'downgrade')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Accept header', () => {
  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', 'abc')
      res.statusCode = 101

      req.socket.destroy()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Extensions header', { skip: runtimeFeatures.has('crypto') === false }, () => {
  return new Promise((resolve, reject) => {
    const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const key = req.headers['sec-websocket-key']
      assert.ok(key)

      const accept = require('node:crypto').hash('sha1', key + uid, 'base64')

      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', accept)
      res.setHeader('Sec-WebSocket-Extensions', 'InvalidExtension')
      res.statusCode = 101

      res.end()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`)

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})

test('Server sends invalid Sec-WebSocket-Extensions header', { skip: runtimeFeatures.has('crypto') === false }, () => {
  const uid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

  return new Promise((resolve, reject) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      const key = req.headers['sec-websocket-key']
      assert.ok(key)

      const accept = require('node:crypto').hash('sha1', key + uid, 'base64')

      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', accept)
      res.setHeader('Sec-WebSocket-Protocol', 'echo') // <--
      res.statusCode = 101

      res.end()
    }).listen(0, () => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.onopen = reject

      ws.addEventListener('error', ({ error }) => {
        assert.ok(error)
        server.close()
        resolve()
      })
    })
  })
})
