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

test('Too many fragments (uncompressed)', (t, done) => {
  t.plan(4)

  const agent = new Agent({
    webSocket: {
      maxFragments: 3
    }
  })

  const server = new WebSocketServer({ port: 0 }, () => {
    const { port } = server.address()
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      dispatcher: agent
    })

    client.addEventListener('error', (event) => {
      t.assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      t.assert.deepStrictEqual(event.code, 1006)
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      t.assert.deepStrictEqual(code, 1008)
      t.assert.deepStrictEqual(reason.toString(), 'Too many message fragments')
      agent.close()
      server.close(done)
    })

    const fragment = Buffer.from('a')
    const options = { fin: false }

    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
  })
})

test('Too many fragments (compressed)', (t, done) => {
  t.plan(4)

  const agent = new Agent({
    webSocket: {
      maxFragments: 3
    }
  })

  const server = new WebSocketServer({
    perMessageDeflate: { threshold: 0 },
    port: 0
  }, () => {
    const { port } = server.address()
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      dispatcher: agent
    })

    client.addEventListener('error', (event) => {
      t.assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      t.assert.deepStrictEqual(event.code, 1006)
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      t.assert.deepStrictEqual(code, 1008)
      t.assert.deepStrictEqual(reason.toString(), 'Too many message fragments')
      agent.close()
      server.close(done)
    })

    const fragment = Buffer.from('a')
    const options = { fin: false }

    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
  })
})
