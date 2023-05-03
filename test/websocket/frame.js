'use strict'

const { test } = require('tap')
const { WebsocketFrameSend } = require('../../lib/websocket/frame')
const { opcodes } = require('../../lib/websocket/constants')

test('Writing 16-bit frame length value at correct offset when buffer has a non-zero byteOffset', (t) => {
  /*
  When writing 16-bit frame lengths, a `DataView` was being used without setting a `byteOffset` into the buffer:
  i.e. `new DataView(buffer.buffer)` instead of `new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)`.
  Small `Buffers` returned by `allocUnsafe` are usually returned from the buffer pool, and thus have a non-zero `byteOffset`.
  Invalid frames were therefore being returned in that case.
  */
  t.plan(3)

  const payloadLength = 126 // 126 bytes is the smallest payload to trigger a 16-bit length field
  const smallBuffer = Buffer.allocUnsafe(1) // make it very likely that the next buffer returned by allocUnsafe DOESN'T have a zero byteOffset
  const payload = Buffer.allocUnsafe(payloadLength).fill(0)
  const frame = new WebsocketFrameSend(payload).createFrame(opcodes.BINARY)

  t.equal(frame[2], payloadLength >>> 8)
  t.equal(frame[3], payloadLength & 0xff)
  t.equal(smallBuffer.length, 1) // ensure smallBuffer can't be garbage-collected too soon
})
