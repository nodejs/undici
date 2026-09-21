'use strict'

const { test } = require('node:test')
const { ByteParser } = require('../../lib/web/websocket/receiver')
const { states } = require('../../lib/web/websocket/constants')

const invalidFrame = Buffer.from([0x82, 0x7F, 0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01])

test('ByteParser rejects 64-bit payload lengths with a non-zero upper word', (t) => {
  const calls = {
    abort: 0,
    close: 0
  }

  const handler = {
    readyState: states.CONNECTING,
    controller: {
      abort: () => {
        calls.abort += 1
      }
    },
    onSocketClose: () => {
      calls.close += 1
    },
    closeState: new Set()
  }

  const parser = new ByteParser(handler)

  parser.write(invalidFrame)

  return new Promise((resolve) => {
    setImmediate(() => {
      t.assert.strictEqual(calls.abort, 1)
      t.assert.strictEqual(calls.close, 1)
      parser.destroy()
      resolve()
    })
  })
})
