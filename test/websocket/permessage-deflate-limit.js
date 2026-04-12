'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { randomFillSync } = require('node:crypto')
const { deflateRawSync } = require('node:zlib')
const { setTimeout: sleep } = require('node:timers/promises')
const { WebSocketServer } = require('ws')
const { WebSocket, Agent } = require('../..')

test('Compressed message under limit decompresses successfully', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    // Send 1 KB of data (well under any reasonable limit)
    ws.send(Buffer.alloc(1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`)

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, 1024)
  client.close()
})

test('Agent webSocketOptions.maxPayloadSize is read correctly', async (t) => {
  const customLimit = 128 * 1024 * 1024 // 128 MB
  const agent = new Agent({
    webSocket: {
      maxPayloadSize: customLimit
    }
  })

  t.after(() => agent.close())

  // Verify the option is stored and retrievable
  t.assert.strictEqual(agent.webSocketOptions.maxPayloadSize, customLimit)
})

test('Agent with default webSocketOptions uses 128 MB limit', async (t) => {
  const agent = new Agent()

  t.after(() => agent.close())

  // Default should be 128 MB
  t.assert.strictEqual(agent.webSocketOptions.maxPayloadSize, 128 * 1024 * 1024)
})

test('Custom maxPayloadSize allows messages under limit', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  const dataSize = 512 * 1024 // 512 KB

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(dataSize, 0x41), { binary: true })
  })

  // Set custom limit of 1 MB via Agent
  const agent = new Agent({
    webSocket: {
      maxPayloadSize: 1 * 1024 * 1024
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, dataSize, 'Message under limit should be received')
  client.close()
})

test('Messages at exactly the limit succeed', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(limit, 0x41), { binary: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  const [event] = await once(client, 'message')
  t.assert.strictEqual(event.data.size, limit, 'Message at exactly the limit should succeed')
  client.close()
})

test('Compressed frame payload over wire-size limit is rejected', async (t) => {
  const limit = 64 * 1024
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let payload = null
  for (let i = 0; i < 10; i++) {
    const candidate = randomFillSync(Buffer.alloc(limit))
    if (deflateRawSync(candidate).length > limit) {
      payload = candidate
      break
    }
  }

  t.assert.ok(payload, 'Expected incompressible payload with compressed wire size over the limit')

  let messageReceived = false

  server.on('connection', (ws) => {
    ws.send(payload, { binary: true, compress: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Compressed frame over wire-size limit should be rejected')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})

test('Messages over the limit are rejected', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let messageReceived = false
  let closeEvent = null

  server.on('connection', (ws) => {
    // Send 2 MB of data, which exceeds the 1 MB limit
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  client.addEventListener('close', (event) => {
    closeEvent = event
  })

  // Wait for connection to close (should happen when limit is exceeded)
  // Use Promise.race with a timeout to avoid hanging forever
  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Message over limit should be rejected')
  t.assert.ok(closeEvent !== null, 'Close event should have been emitted')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})

test('Limit can be disabled by setting maxPayloadSize to 0', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  const dataSize = 100 * 1024 * 1024 // 100 MB

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(dataSize, 0x41), { binary: true })
  })

  // Set limit to 0 (disabled)
  const agent = new Agent({
    webSocket: {
      maxPayloadSize: 0
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  // Use Promise.race with timeout since large message takes time
  const messagePromise = once(client, 'message')
  const timeoutPromise = sleep(10000)

  const result = await Promise.race([messagePromise, timeoutPromise])

  if (result) {
    t.assert.strictEqual(result[0].data.size, dataSize, 'Large message should be received when limit is disabled')
    client.close()
  } else {
    t.fail('Test timed out waiting for large message')
  }
})

test('Fragmented compressed payload over total limit is rejected', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const fragmentSize = 768 * 1024 // 768 KB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let messageReceived = false

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(fragmentSize, 0x41), {
      binary: true,
      compress: true,
      fin: false
    })

    ws.send(Buffer.alloc(fragmentSize, 0x41), {
      binary: true,
      compress: true,
      fin: true
    })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Fragmented compressed message over total limit should be rejected')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})

test('Raw uncompressed payload over immediate limit is rejected', async (t) => {
  const limit = 100
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: false // Disable compression
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let messageReceived = false

  server.on('connection', (ws) => {
    // Send 101 bytes uncompressed so the inline payload length path is used.
    ws.send(Buffer.alloc(101, 0x41), { binary: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Raw uncompressed message over limit should be rejected')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})

test('Raw uncompressed payload over 16-bit extended limit is rejected', async (t) => {
  const limit = 1 * 1024 // 1 KB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: false // Disable compression
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let messageReceived = false

  server.on('connection', (ws) => {
    // Send 2 KB uncompressed so the extended 16-bit payload length path is used.
    ws.send(Buffer.alloc(2 * 1024, 0x41), { binary: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Raw uncompressed message over limit should be rejected')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})

test('Raw uncompressed payload over 64-bit extended limit is rejected', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: false // Disable compression
  })

  t.after(() => server.close())
  await once(server, 'listening')

  let messageReceived = false

  server.on('connection', (ws) => {
    // Send 2 MB uncompressed so the extended 64-bit payload length path is used.
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const agent = new Agent({
    webSocket: {
      maxPayloadSize: limit
    }
  })

  t.after(() => agent.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  const closePromise = once(client, 'close')
  const timeoutPromise = sleep(5000)

  await Promise.race([closePromise, timeoutPromise])

  t.assert.strictEqual(messageReceived, false, 'Raw uncompressed message over limit should be rejected')
  t.assert.strictEqual(client.readyState, WebSocket.CLOSED, 'Connection should be closed after exceeding limit')
})
