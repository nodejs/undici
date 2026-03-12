'use strict'

const { test } = require('node:test')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { kController, kResponse } = require('../../lib/web/websocket/symbols')

const invalidFrame = Buffer.from([0x82, 0x7F, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])

test('ByteParser rejects 64-bit payload lengths with a non-zero upper word', (t) => {
  const calls = {
    abort: 0,
    destroy: 0
  }

  const ws = new EventTarget()
  ws[kController] = {
    abort: () => {
      calls.abort += 1
    }
  }
  ws[kResponse] = {
    socket: {
      destroyed: false,
      destroy: () => {
        calls.destroy += 1
      }
    }
  }

  const parser = new ByteParser(ws)

  parser.write(invalidFrame)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(calls.abort, 1)
      t.assert.strictEqual(calls.destroy, 1)
      parser.destroy()
      resolve()
    })
  })
})
