'use strict'

const { test, after } = require('node:test')
const { WebSocketServer } = require('ws')
const { Agent, WebSocket } = require('../..')
const diagnosticsChannel = require('node:diagnostics_channel')

function testTooManyFragments (t, done, { serverOptions = {}, send }) {
  t.plan(4)

  const agent = new Agent({
    webSocket: {
      maxFragments: 3
    }
  })

  let pendingCloseEvents = 2
  function finish () {
    if (--pendingCloseEvents === 0) {
      agent.close()
      server.close(done)
    }
  }

  const server = new WebSocketServer({
    ...serverOptions,
    port: 0
  }, () => {
    const { port } = server.address()
    const client = new WebSocket(`ws://127.0.0.1:${port}`, {
      dispatcher: agent
    })

    client.addEventListener('error', () => {
      t.assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      t.assert.deepStrictEqual(event.code, 1006)
      finish()
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      t.assert.deepStrictEqual(code, 1008)
      t.assert.deepStrictEqual(reason.toString(), 'Too many message fragments')
      finish()
    })

    send(ws)
  })
}

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

test('Fragmented frame with empty fragments', (t, done) => {
  t.plan(1)

  const server = new WebSocketServer({ port: 0 }, () => {
    const { port } = server.address()
    const client = new WebSocket(`ws://127.0.0.1:${port}`)

    client.addEventListener('message', ({ data }) => {
      t.assert.strictEqual(data, '')
      client.close()
      server.close(done)
    })
  })

  server.on('connection', (ws) => {
    const socket = ws._socket

    ws.send('', { fin: false }) // Text frame with empty payload
    ws.send('', { fin: false }) // Continuation frame with empty payload
    ws.send('', { fin: true }) // Final continuation frame with empty payload
  })
})

test('Too many empty fragments', (t, done) => {
  testTooManyFragments(t, done, {
    send (ws) {
      const socket = ws._socket

      socket.write(Buffer.from([0x01, 0x00])) // Text frame with empty payload
      socket.write(Buffer.from([0x00, 0x00])) // Continuation frame with empty payload
      socket.write(Buffer.from([0x00, 0x00])) // Continuation frame with empty payload
      socket.write(Buffer.from([0x80, 0x00])) // Final continuation frame with empty payload
    }
  })
})

test('Too many fragments (uncompressed)', (t, done) => {
  testTooManyFragments(t, done, {
    send (ws) {
      const fragment = Buffer.from('a')
      const options = { fin: false }

      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
    }
  })
})

test('Too many fragments (compressed)', (t, done) => {
  testTooManyFragments(t, done, {
    serverOptions: {
      perMessageDeflate: { threshold: 0 }
    },
    send (ws) {
      const fragment = Buffer.from('a')
      const options = { fin: false }

      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
    }
  })
})
