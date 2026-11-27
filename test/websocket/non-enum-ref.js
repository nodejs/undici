'use strict'

const { test } = require('node:test')
const { WebSocket } = require('../..')
const kRef = Symbol.for('nodejs.ref')
const kUnref = Symbol.for('nodejs.unref')

test('kRef/kUnref are non-enumerable on WebSocket.prototype', async (t) => {
  const refDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, kRef)
  console.log(refDesc)
  t.assert.ok(!refDesc.enumerable)

  const unrefDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, kUnref)
  t.assert.ok(!unrefDesc.enumerable)
})
