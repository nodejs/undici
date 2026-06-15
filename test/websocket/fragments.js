'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket, Agent } = require('../..')
const diagnosticsChannel = require('node:diagnostics_channel')

test('Fragmented frame with a ping frame in the middle of it', () => {
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
    ({ payload }) => assert.deepStrictEqual(payload, Buffer.from('Hello'))
  )

  return new Promise((resolve) => {
    ws.addEventListener('message', ({ data }) => {
      assert.strictEqual(data, 'Hello')

      ws.close()
      resolve()
    })
  })
})

test('Too many fragments (uncompressed)', (t, done) => {
  function maybeDone () {
    if (++maybeDone.callCount === 2) {
      agent.close()
      server.close(done)
    }
  }

  maybeDone.callCount = 0

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

    client.addEventListener('error', () => {
      assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      assert.strictEqual(event.code, 1006)
      maybeDone()
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      assert.strictEqual(code, 1008)
      assert.strictEqual(reason.toString(), 'Too many message fragments')
      maybeDone()
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
  function maybeDone () {
    if (++maybeDone.callCount === 2) {
      agent.close()
      server.close(done)
    }
  }

  maybeDone.callCount = 0

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

    client.addEventListener('error', () => {
      assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      assert.strictEqual(event.code, 1006)
      maybeDone()
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      assert.strictEqual(code, 1008)
      assert.strictEqual(reason.toString(), 'Too many message fragments')
      maybeDone()
    })

    const fragment = Buffer.from('a')
    const options = { fin: false }

    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
    ws.send(fragment, options)
  })
})

test('Empty first fragment followed by non-empty continuation delivers the message', () => {
  // RFC 6455 §5.4 allows zero-byte fragments. A conforming server that opens
  // a fragmented message with an empty frame must be honored: the parser must
  // recognize the in-progress fragmented message when the continuation arrives.
  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.send('', { fin: false })
    ws.send('hello', { fin: true })
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
      assert.strictEqual(data, 'hello')

      ws.close()
      resolve()
    })
  })
})

test('Too many empty fragments triggers close 1008', (t, done) => {
  function maybeDone () {
    if (++maybeDone.callCount === 2) {
      agent.close()
      server.close(done)
    }
  }

  maybeDone.callCount = 0

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

    client.addEventListener('error', () => {
      assert.ok(true)
    })

    client.addEventListener('close', (event) => {
      assert.strictEqual(event.code, 1006)
      maybeDone()
    })
  })

  server.on('connection', (ws) => {
    ws.on('close', (code, reason) => {
      assert.strictEqual(code, 1008)
      assert.strictEqual(reason.toString(), 'Too many message fragments')
      maybeDone()
    })

    const fragment = ''
    const options = { fin: false }

    ws.send(fragment, options) // Text frame fin=0, len=0
    ws.send(fragment, options) // Continuation fin=0, len=0
    ws.send(fragment, options) // Continuation fin=0, len=0
    ws.send(fragment, options) // Continuation fin=0, len=0
  })
})
