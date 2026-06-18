'use strict'

const { test, after } = require('node:test')
const { WebSocketServer } = require('ws')
const { Agent, WebSocket } = require('../..')
const diagnosticsChannel = require('node:diagnostics_channel')

test('Fragmented frame with a ping frame in the middle of it', (t) => {
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x01, 0x03, 0x48, 0x65, 0x6c])) // Text frame "Hel"
    socket.write(Buffer.from([0x89, 0x05, 0x48, 0x65, 0x6c, 0x6c, 0x6f])) // ping "Hello"
    socket.write(Buffer.from([0x80, 0x02, 0x6c, 0x6f])) // Text frame "lo"
  })

  after(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  diagnosticsChannel.channel('undici:websocket:ping').subscribe(
    ({ payload }) => t.assert.deepStrictEqual(payload, Buffer.from('Hello'))
  )

  return new Promise((resolve) => {
    ws.addEventListener('message', ({ data }) => {
      t.assert.strictEqual(data, 'Hello')

      ws.close()
      resolve()
    })
  })
})

test('Empty first fragment followed by non-empty continuation delivers the message', (t) => {
  // RFC 6455 §5.4 allows zero-byte fragments. A conforming server that opens
  // a fragmented message with an empty frame must be honored: the parser must
  // recognize the in-progress fragmented message when the continuation arrives.
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.send('', { fin: false })  // Text frame fin=0, len=0
    ws.send('hello', { fin: true }) // Continuation fin=1, "hello"
  })

  after(() => {
    for (const client of server.clients) {
      client.close()
    }

    server.close()
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  return new Promise((resolve) => {
    ws.addEventListener('message', ({ data }) => {
      t.assert.strictEqual(data, 'hello')

      ws.close()
      resolve()
    })
  })
})
