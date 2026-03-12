'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const http = require('node:http')
const crypto = require('node:crypto')
const zlib = require('node:zlib')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

/**
 * Creates a WebSocket frame.
 * @param {object} options
 * @param {number} options.opcode - Frame opcode (1=text, 2=binary)
 * @param {boolean} options.fin - Final frame flag
 * @param {boolean} options.rsv1 - RSV1 flag (compression)
 * @param {Buffer} options.payload - Frame payload
 * @returns {Buffer}
 */
function createWebSocketFrame ({ opcode, fin = true, rsv1 = false, payload }) {
  const payloadLength = payload.length
  let headerLength = 2

  if (payloadLength > 65535) {
    headerLength += 8
  } else if (payloadLength > 125) {
    headerLength += 2
  }

  const header = Buffer.alloc(headerLength)

  // First byte: FIN + RSV1 + opcode
  header[0] = (fin ? 0x80 : 0x00) | (rsv1 ? 0x40 : 0x00) | opcode

  // Second byte: MASK (0) + payload length
  if (payloadLength > 65535) {
    header[1] = 127
    header.writeBigUInt64BE(BigInt(payloadLength), 2)
  } else if (payloadLength > 125) {
    header[1] = 126
    header.writeUInt16BE(payloadLength, 2)
  } else {
    header[1] = payloadLength
  }

  return Buffer.concat([header, payload])
}

/**
 * Creates a compressed payload using DEFLATE raw.
 * @param {number} targetSize - Target decompressed size in bytes
 * @returns {Buffer}
 */
function createCompressedPayload (targetSize) {
  // Create highly compressible data (repeated 'A' characters)
  const data = Buffer.alloc(targetSize, 0x41)
  return zlib.deflateRawSync(data)
}

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
  assert.strictEqual(event.data.size, 1024)
  client.close()
})

test('Custom maxDecompressedMessageSize is enforced', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  let messageReceived = false

  server.on('connection', (ws) => {
    // Send 2 MB of data
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  // Set custom limit of 1 MB
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  // Wait for the connection to close
  await once(client, 'close')

  // The message should NOT have been received due to size limit
  assert.strictEqual(messageReceived, false)
})

test('Message exactly at limit succeeds', async (t) => {
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

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: limit
  })

  const [event] = await once(client, 'message')
  assert.strictEqual(event.data.size, limit)
  client.close()
})

test('Message one byte over limit fails', async (t) => {
  const limit = 1 * 1024 * 1024 // 1 MB
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(limit + 1, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: limit
  })

  const [event] = await once(client, 'error')
  assert.ok(event.error instanceof Error)
})

test('Connection closes when limit exceeded', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  const [event] = await once(client, 'close')
  // Connection should be closed - code 1006 (abnormal) or 1009 (too big)
  assert.ok(event.code === 1006 || event.code === 1009)
})

test('Non-compressed messages are not affected by decompression limit', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: false // Compression disabled
  })

  t.after(() => server.close())

  await once(server, 'listening')

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(2 * 1024 * 1024, 0x41), { binary: true })
  })

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024
  })

  // Should succeed because compression is not used
  const [event] = await once(client, 'message')
  assert.strictEqual(event.data.size, 2 * 1024 * 1024)
  client.close()
})

test('Decompression bomb is mitigated via raw WebSocket handshake', async (t) => {
  // This test validates the fix using a technique similar to the original PoC
  // by creating a minimal malicious server that sends a compressed payload
  const server = http.createServer()

  let messageReceived = false

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key']
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      'Sec-WebSocket-Extensions: permessage-deflate',
      '', ''
    ].join('\r\n'))

    // Send a small payload that decompresses to ~10 MB
    setTimeout(() => {
      const bomb = createCompressedPayload(10 * 1024 * 1024)
      const frame = createWebSocketFrame({ opcode: 2, rsv1: true, payload: bomb })
      socket.write(frame)
    }, 100)
  })

  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => server.close())

  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 1 * 1024 * 1024 // 1 MB limit
  })

  client.addEventListener('message', () => {
    messageReceived = true
  })

  // Wait for the connection to close
  await once(client, 'close')

  // The message should NOT have been received due to size limit
  assert.strictEqual(messageReceived, false)
})

test('Higher custom limit allows larger messages', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    perMessageDeflate: true
  })

  t.after(() => server.close())

  await once(server, 'listening')

  const dataSize = 5 * 1024 * 1024 // 5 MB

  server.on('connection', (ws) => {
    ws.send(Buffer.alloc(dataSize, 0x41), { binary: true })
  })

  // Set custom limit of 10 MB
  const client = new WebSocket(`ws://127.0.0.1:${server.address().port}`, {
    maxDecompressedMessageSize: 10 * 1024 * 1024
  })

  const [event] = await once(client, 'message')
  assert.strictEqual(event.data.size, dataSize)
  client.close()
})
