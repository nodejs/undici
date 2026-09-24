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

test('Masked payloads unmask to the original bytes for every tail length', (t) => {
  const lengths = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 125, 126, 65535, 65536]

  const payloadOffset = (head) => {
    const length = head[1] & 0x7f
    return length === 127 ? 14 : length === 126 ? 8 : 6
  }

  const unmask = (body, mask) => Buffer.from(body.map((byte, i) => byte ^ mask[i & 3]))

  for (const length of lengths) {
    const payload = Buffer.alloc(length)
    for (let i = 0; i < length; i++) payload[i] = (i * 31 + 7) & 0xff

    const frame = new WebsocketFrameSend(payload).createFrame(opcodes.BINARY)
    const offset = payloadOffset(frame)
    t.assert.strictEqual(frame.length, offset + length)
    t.assert.deepStrictEqual(unmask(frame.subarray(offset), frame.subarray(offset - 4, offset)), payload)

    const [head, body] = WebsocketFrameSend.createFastTextFrame(Buffer.from(payload))
    const headOffset = payloadOffset(head)
    t.assert.strictEqual(head.length, headOffset)
    t.assert.strictEqual(body.length, length)
    t.assert.deepStrictEqual(unmask(body, head.subarray(headOffset - 4, headOffset)), payload)
  }
})
