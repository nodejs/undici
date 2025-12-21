'use strict'

const { test, describe } = require('node:test')

const {
  isCTLExcludingHtab
} = require('../../lib/web/cookies/util')

describe('isCTLExcludingHtab', () => {
  test('should return false for 0x00 - 0x08 characters', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab('\x00'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x01'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x02'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x03'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x04'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x05'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x06'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x07'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x08'), true)
  })

  test('should return false for 0x09 HTAB character', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab('\x09'), false)
  })

  test('should return false for 0x0A - 0x1F characters', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab('\x0A'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x0B'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x0C'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x0D'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x0E'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x0F'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x10'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x11'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x12'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x13'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x14'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x15'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x16'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x17'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x18'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x19'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1A'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1B'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1C'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1D'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1E'), true)
    t.assert.strictEqual(isCTLExcludingHtab('\x1F'), true)
  })

  test('should return false for a 0x7F character', t => {
    t.assert.strictEqual(isCTLExcludingHtab('\x7F'), true)
  })

  test('should return false for a 0x20 / space character', t => {
    t.assert.strictEqual(isCTLExcludingHtab(' '), false)
  })

  test('should return false for a printable character', t => {
    t.assert.strictEqual(isCTLExcludingHtab('A'), false)
    t.assert.strictEqual(isCTLExcludingHtab('Z'), false)
    t.assert.strictEqual(isCTLExcludingHtab('a'), false)
    t.assert.strictEqual(isCTLExcludingHtab('z'), false)
    t.assert.strictEqual(isCTLExcludingHtab('!'), false)
  })

  test('should return false for an empty string', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab(''), false)
  })

  test('all printable characters (0x20 - 0x7E)', (t) => {
    for (let i = 0x20; i < 0x7F; i++) {
      t.assert.strictEqual(isCTLExcludingHtab(String.fromCharCode(i)), false)
    }
  })

  test('valid case', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab('Space=Cat; Secure; HttpOnly; Max-Age=2'), false)
  })

  test('invalid case', (t) => {
    t.assert.strictEqual(isCTLExcludingHtab('Space=Cat; Secure; HttpOnly; Max-Age=2\x7F'), true)
  })
})
