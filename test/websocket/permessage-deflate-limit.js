'use strict'

const { test } = require('node:test')
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
  t.assert.strictEqual(event.data.size, 1024)
  client.close()
})
