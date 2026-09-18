'use strict'

const { test } = require('node:test')
const { WebsocketFrameSend } = require('../../lib/web/websocket/frame')
const { opcodes } = require('../../lib/web/websocket/constants')

// Always be above all tests.
test('Don not use pooled buffer in mask pool', (t) => {
  const allocUnsafe = Buffer.allocUnsafe
  let counter = 0
  try {
    Buffer.allocUnsafe = (n) => {
      counter++
      return allocUnsafe(n)
    }
    // create mask pool
    new WebsocketFrameSend(Buffer.alloc(0)).createFrame(opcodes.BINARY)
    t.assert.strictEqual(counter, 1)
  } finally {
    Buffer.allocUnsafe = allocUnsafe
  }
})

test('Writing 16-bit frame length value at correct offset when buffer has a non-zero byteOffset', (t) => {
  /*
  When writing 16-bit frame lengths, a `DataView` was being used without setting a `byteOffset` into the buffer:
  i.e. `new DataView(buffer.buffer)` instead of `new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)`.
  Small `Buffers` returned by `allocUnsafe` are usually returned from the buffer pool, and thus have a non-zero `byteOffset`.
  Invalid frames were therefore being returned in that case.
  */
  const payloadLength = 126 // 126 bytes is the smallest payload to trigger a 16-bit length field
  const smallBuffer = Buffer.allocUnsafe(1) // make it very likely that the next buffer returned by allocUnsafe DOESN'T have a zero byteOffset
  const payload = Buffer.allocUnsafe(payloadLength).fill(0)
  const frame = new WebsocketFrameSend(payload).createFrame(opcodes.BINARY)

  t.assert.strictEqual(frame[2], payloadLength >>> 8)
  t.assert.strictEqual(frame[3], payloadLength & 0xff)
  t.assert.strictEqual(smallBuffer.length, 1) // ensure smallBuffer can't be garbage-collected too soon
})

test('Masks aligned and unaligned payloads without changing frame semantics', (t) => {
  for (const length of [0, 1, 3, 4, 5, 7, 8, 9, 125, 126, 127, 65535, 65536]) {
    const payload = Buffer.alloc(length)
    for (let i = 0; i < payload.length; ++i) payload[i] = i & 0xff
    const originalPayload = Buffer.from(payload)
    const frame = new WebsocketFrameSend(payload).createFrame(opcodes.BINARY)
    const offset = length > 65535 ? 14 : length > 125 ? 8 : 6
    const mask = frame.subarray(offset - 4, offset)
    const decoded = Buffer.alloc(length)
    for (let i = 0; i < length; ++i) decoded[i] = frame[offset + i] ^ mask[i & 3]
    t.assert.deepStrictEqual(decoded, originalPayload)
    t.assert.deepStrictEqual(payload, originalPayload)
  }

  const text = Buffer.from('héllo websocket 🌍'.repeat(2))
  const backing = Buffer.alloc(text.length + 1)
  text.copy(backing, 1)
  const view = backing.subarray(1)
  const original = Buffer.from(view)
  const [head, body] = WebsocketFrameSend.createFastTextFrame(view)
  const mask = head.subarray(head.length - 4)
  const decoded = Buffer.alloc(body.length)
  for (let i = 0; i < body.length; ++i) decoded[i] = body[i] ^ mask[i & 3]
  t.assert.deepStrictEqual(decoded, original)
})
