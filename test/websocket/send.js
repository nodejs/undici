'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { Blob } = require('buffer')
const { WebSocket } = require('../..')

test('Sending > 2^16 bytes', (t) => {
  t.plan(3)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (m, isBinary) => {
      ws.send(m, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(2 ** 16).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send(payload)
  })

  ws.addEventListener('message', async ({ data }) => {
    t.type(data, Blob)
    t.equal(data.size, payload.length)
    t.same(Buffer.from(await data.arrayBuffer()), payload)

    ws.close()
    server.close()
  })
})

test('Sending data after close', (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    t.pass()

    ws.on('message', t.fail)
  })

  t.teardown(server.close.bind(server))
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.close()
    ws.send('Some message')

    t.pass()
  })

  ws.addEventListener('error', t.fail)
})

test('Sending data before connected', (t) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })

  t.teardown(server.close.bind(server))
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  t.throws(
    () => ws.send('Not sent'),
    {
      name: 'InvalidStateError',
      constructor: DOMException
    }
  )

  t.equal(ws.readyState, WebSocket.CONNECTING)
})

test('Sending data to a server', (t) => {
  t.plan(3)

  t.test('Send with string', (t) => {
    t.plan(2)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('message', (data, isBinary) => {
        t.notOk(isBinary, 'Received text frame')
        t.same(data, Buffer.from('message'))

        ws.close(1000)
      })
    })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send('message')
    })
  })

  t.test('Send with ArrayBuffer', (t) => {
    t.plan(2)

    const message = new TextEncoder().encode('message')
    const ab = new ArrayBuffer(7)
    new Uint8Array(ab).set(message)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('message', (data, isBinary) => {
        t.ok(isBinary)
        t.same(new Uint8Array(data), message)

        ws.close(1000)
      })
    })

    t.teardown(server.close.bind(server))
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send(ab)
    })
  })

  t.test('Send with Blob', (t) => {
    t.plan(2)

    const blob = new Blob(['hello'])
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('message', (data, isBinary) => {
        t.ok(isBinary)
        t.same(data, Buffer.from('hello'))

        ws.close(1000)
      })
    })

    t.teardown(server.close.bind(server))
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send(blob)
    })
  })
})
