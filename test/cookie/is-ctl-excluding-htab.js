'use strict'

const { test, describe } = require('node:test')
const { strictEqual } = require('node:assert')

const {
  isCTLExcludingHtab
} = require('../../lib/web/cookies/util')

describe('isCTLExcludingHtab', () => {
  test('should return false for 0x00 - 0x08 characters', () => {
    strictEqual(isCTLExcludingHtab('\x00'), true)
    strictEqual(isCTLExcludingHtab('\x01'), true)
    strictEqual(isCTLExcludingHtab('\x02'), true)
    strictEqual(isCTLExcludingHtab('\x03'), true)
    strictEqual(isCTLExcludingHtab('\x04'), true)
    strictEqual(isCTLExcludingHtab('\x05'), true)
    strictEqual(isCTLExcludingHtab('\x06'), true)
    strictEqual(isCTLExcludingHtab('\x07'), true)
    strictEqual(isCTLExcludingHtab('\x08'), true)
  })

  test('should return false for 0x09 HTAB character', () => {
    strictEqual(isCTLExcludingHtab('\x09'), false)
  })

  test('should return false for 0x0A - 0x1F characters', () => {
    strictEqual(isCTLExcludingHtab('\x0A'), true)
    strictEqual(isCTLExcludingHtab('\x0B'), true)
    strictEqual(isCTLExcludingHtab('\x0C'), true)
    strictEqual(isCTLExcludingHtab('\x0D'), true)
    strictEqual(isCTLExcludingHtab('\x0E'), true)
    strictEqual(isCTLExcludingHtab('\x0F'), true)
    strictEqual(isCTLExcludingHtab('\x10'), true)
    strictEqual(isCTLExcludingHtab('\x11'), true)
    strictEqual(isCTLExcludingHtab('\x12'), true)
    strictEqual(isCTLExcludingHtab('\x13'), true)
    strictEqual(isCTLExcludingHtab('\x14'), true)
    strictEqual(isCTLExcludingHtab('\x15'), true)
    strictEqual(isCTLExcludingHtab('\x16'), true)
    strictEqual(isCTLExcludingHtab('\x17'), true)
    strictEqual(isCTLExcludingHtab('\x18'), true)
    strictEqual(isCTLExcludingHtab('\x19'), true)
    strictEqual(isCTLExcludingHtab('\x1A'), true)
    strictEqual(isCTLExcludingHtab('\x1B'), true)
    strictEqual(isCTLExcludingHtab('\x1C'), true)
    strictEqual(isCTLExcludingHtab('\x1D'), true)
    strictEqual(isCTLExcludingHtab('\x1E'), true)
    strictEqual(isCTLExcludingHtab('\x1F'), true)
  })

  test('should return false for a 0x7F character', t => {
    strictEqual(isCTLExcludingHtab('\x7F'), true)
  })

  test('should return false for a 0x20 / space character', t => {
    strictEqual(isCTLExcludingHtab(' '), false)
  })

  test('should return false for a printable character', t => {
    strictEqual(isCTLExcludingHtab('A'), false)
    strictEqual(isCTLExcludingHtab('Z'), false)
    strictEqual(isCTLExcludingHtab('a'), false)
    strictEqual(isCTLExcludingHtab('z'), false)
    strictEqual(isCTLExcludingHtab('!'), false)
  })

  test('should return false for an empty string', () => {
    strictEqual(isCTLExcludingHtab(''), false)
  })

  test('all printable characters (0x20 - 0x7E)', () => {
    for (let i = 0x20; i < 0x7F; i++) {
      strictEqual(isCTLExcludingHtab(String.fromCharCode(i)), false)
    }
  })

  test('valid case', () => {
    strictEqual(isCTLExcludingHtab('Space=Cat; Secure; HttpOnly; Max-Age=2'), false)
  })

  test('invalid case', () => {
    strictEqual(isCTLExcludingHtab('Space=Cat; Secure; HttpOnly; Max-Age=2\x7F'), true)
  })
})
