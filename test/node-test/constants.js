'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const {
  wellknownHeaderNames,
  getHeaderNameAsBuffer
} = require('../../lib/core/constants')

test('getHeaderNameAsBuffer returns cached buffer for well-known headers', () => {
  for (let i = 0; i < wellknownHeaderNames.length; ++i) {
    const lowerCased = wellknownHeaderNames[i].toLowerCase()
    const first = getHeaderNameAsBuffer(lowerCased)
    const second = getHeaderNameAsBuffer(lowerCased)
    assert.ok(Buffer.isBuffer(first))
    assert.strictEqual(first.toString(), lowerCased)
    assert.strictEqual(first, second, `expected cached buffer for ${lowerCased}`)
  }
})

test('getHeaderNameAsBuffer allocates a new buffer for unknown headers', () => {
  const buffer = getHeaderNameAsBuffer('x-custom-not-well-known')
  assert.ok(Buffer.isBuffer(buffer))
  assert.strictEqual(buffer.toString(), 'x-custom-not-well-known')
})
