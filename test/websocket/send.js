'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { WebSocketServer } = require('ws')
const { Blob } = require('node:buffer')
const { WebSocket } = require('../..')

// the following three tests exercise different code paths because of the three
// different ways a payload length may be specified in a WebSocket frame
// (https://datatracker.ietf.org/doc/html/rfc6455#section-5.2)

test('Sending >= 2^16 bytes', () => {
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

  return new Promise((resolve) => {
    ws.addEventListener('message', async ({ data }) => {
      assert.ok(data instanceof Blob)
      assert.equal(data.size, payload.length)
      assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)

      ws.close()
      server.close()

      resolve()
    })
  })
})

test('Sending >= 126, < 2^16 bytes', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (m, isBinary) => {
      ws.send(m, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(126).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send(payload)
  })

  return new Promise((resolve) => {
    ws.addEventListener('message', async ({ data }) => {
      assert.ok(data instanceof Blob)
      assert.equal(data.size, payload.length)
      assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)

      ws.close()
      server.close()
      resolve()
    })
  })
})

test('Sending < 126 bytes', () => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (m, isBinary) => {
      ws.send(m, { binary: isBinary })
    })
  })

  const payload = Buffer.allocUnsafe(125).fill('Hello')

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send(payload)
  })

  return new Promise((resolve) => {
    ws.addEventListener('message', async ({ data }) => {
      assert.ok(data instanceof Blob)
      assert.equal(data.size, payload.length)
      assert.deepStrictEqual(Buffer.from(await data.arrayBuffer()), payload)

      ws.close()
      server.close()
      resolve()
    })
  })
})

test('Sending data after close', () => {
  const server = new WebSocketServer({ port: 0 })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  return new Promise((resolve, reject) => {
    server.on('connection', (ws) => {
      ws.on('message', reject)
    })

    ws.addEventListener('open', () => {
      ws.close()
      ws.send('Some message')
      server.close()

      resolve()
    })

    ws.addEventListener('error', reject)
  })
})

test('Sending data before connected', () => {
  const server = new WebSocketServer({ port: 0 })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  assert.throws(
    () => ws.send('Not sent'),
    {
      name: 'InvalidStateError',
      constructor: DOMException
    }
  )

  assert.equal(ws.readyState, WebSocket.CONNECTING)
  server.close()
})

describe('Sending data to a server', () => {
  test('Send with string', () => {
    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send('message')
    })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('message', (data, isBinary) => {
          assert.ok(!isBinary, 'Received text frame')
          assert.deepStrictEqual(data, Buffer.from('message'))
          ws.close(1000)
          server.close()
          resolve()
        })
      })
    })
  })

  test('Send with ArrayBuffer', () => {
    const message = new TextEncoder().encode('message')
    const ab = new ArrayBuffer(7)
    new Uint8Array(ab).set(message)

    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send(ab)
    })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('message', (data, isBinary) => {
          assert.ok(isBinary)
          assert.deepStrictEqual(new Uint8Array(data), message)
          ws.close(1000)
          server.close()
          resolve()
        })
      })
    })
  })

  test('Send with Blob', () => {
    const blob = new Blob(['hello'])
    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send(blob)
    })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('message', (data, isBinary) => {
          assert.ok(isBinary)
          assert.deepStrictEqual(data, Buffer.from('hello'))
          ws.close(1000)
          server.close()
          resolve()
        })
      })
    })
  })

  test('Cannot send with SharedArrayBuffer', () => {
    const sab = new SharedArrayBuffer(0)
    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      ws.send(sab)
    })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('message', (data, isBinary) => {
          assert.ok(!isBinary)
          assert.deepStrictEqual(data, Buffer.from('[object SharedArrayBuffer]'))
          ws.close(1000)
          server.close()
          resolve()
        })
      })
    })
  })
})
