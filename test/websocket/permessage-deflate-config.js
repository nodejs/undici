'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket, Agent, Client, Pool } = require('../..')

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

test('Client webSocketOptions.maxPayloadSize is read correctly', async (t) => {
  const customLimit = 32 * 1024 * 1024 // 32 MB
  const client = new Client('http://localhost', {
    webSocket: {
      maxPayloadSize: customLimit
    }
  })

  t.after(() => client.close())

  // Verify the option is stored and retrievable
  t.assert.strictEqual(client.webSocketOptions.maxPayloadSize, customLimit)
})

test('Pool webSocketOptions.maxPayloadSize is read correctly', async (t) => {
  const customLimit = 16 * 1024 * 1024 // 16 MB
  const pool = new Pool('http://localhost', {
    webSocket: {
      maxPayloadSize: customLimit
    }
  })

  t.after(() => pool.close())

  // Verify the option is stored and retrievable
  t.assert.strictEqual(pool.webSocketOptions.maxPayloadSize, customLimit)
})
