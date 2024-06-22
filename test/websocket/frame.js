'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { WebsocketFrameSend } = require('../../lib/web/websocket/frame')
const { opcodes } = require('../../lib/web/websocket/constants')

// Always be above all tests.
test('Don not use pooled buffer in mask pool', () => {
  const allocUnsafe = Buffer.allocUnsafe
  let counter = 0
  try {
    Buffer.allocUnsafe = (n) => {
      counter++
      return allocUnsafe(n)
    }
    // create mask pool
    new WebsocketFrameSend(Buffer.alloc(0)).createFrame(opcodes.BINARY)
    assert.strictEqual(counter, 1)
  } finally {
    Buffer.allocUnsafe = allocUnsafe
  }
})

test('Writing 16-bit frame length value at correct offset when buffer has a non-zero byteOffset', () => {
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

  assert.equal(frame[2], payloadLength >>> 8)
  assert.equal(frame[3], payloadLength & 0xff)
  assert.equal(smallBuffer.length, 1) // ensure smallBuffer can't be garbage-collected too soon
})
