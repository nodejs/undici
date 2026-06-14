'use strict'

const { test } = require('node:test')
const { isToken, isTSpecial, isCTL } = require('../../lib/web/fetch/formdata-parser')

test('HTTP/1.1 token character validation rules', async (t) => {
  await t.test('isCTL should catch control sequences', (t) => {
    t.assert.strictEqual(isCTL(0x00), true)  // Null
    t.assert.strictEqual(isCTL(0x09), true)  // Tab
    t.assert.strictEqual(isCTL(0x1F), true)  // US
    t.assert.strictEqual(isCTL(0x7F), true)  // DEL
    t.assert.strictEqual(isCTL(0x41), false) // 'A'
  })

  await t.test('isTSpecial should flag accurate network separators', (t) => {
    t.assert.strictEqual(isTSpecial(0x20), true)  // Space
    t.assert.strictEqual(isTSpecial(0x09), true)  // Tab
    t.assert.strictEqual(isTSpecial(0x3D), true)  // '='
    t.assert.strictEqual(isTSpecial(0x2B), false) // '+' (Must be false!)
    t.assert.strictEqual(isTSpecial(0x41), false) // 'A'
  })

  await t.test('isToken should confirm safe token symbols', (t) => {
    t.assert.strictEqual(isToken(0x2B), true)  // '+' should be a valid token
    t.assert.strictEqual(isToken(0x2D), true)  // '-' should be a valid token
    t.assert.strictEqual(isToken(0x20), false) // Space is blocked
    t.assert.strictEqual(isToken(0x3D), false) // '=' is blocked
  })
})
