'use strict'

const { test, describe } = require('node:test')

const {
  validateCookiePath
} = require('../../lib/web/cookies/util')

describe('validateCookiePath', () => {
  test('should throw for CTLs', (t) => {
    t.assert.throws(() => validateCookiePath('\x00'))
    t.assert.throws(() => validateCookiePath('\x01'))
    t.assert.throws(() => validateCookiePath('\x02'))
    t.assert.throws(() => validateCookiePath('\x03'))
    t.assert.throws(() => validateCookiePath('\x04'))
    t.assert.throws(() => validateCookiePath('\x05'))
    t.assert.throws(() => validateCookiePath('\x06'))
    t.assert.throws(() => validateCookiePath('\x07'))
    t.assert.throws(() => validateCookiePath('\x08'))
    t.assert.throws(() => validateCookiePath('\x09'))
    t.assert.throws(() => validateCookiePath('\x0A'))
    t.assert.throws(() => validateCookiePath('\x0B'))
    t.assert.throws(() => validateCookiePath('\x0C'))
    t.assert.throws(() => validateCookiePath('\x0D'))
    t.assert.throws(() => validateCookiePath('\x0E'))
    t.assert.throws(() => validateCookiePath('\x0F'))
    t.assert.throws(() => validateCookiePath('\x10'))
    t.assert.throws(() => validateCookiePath('\x11'))
    t.assert.throws(() => validateCookiePath('\x12'))
    t.assert.throws(() => validateCookiePath('\x13'))
    t.assert.throws(() => validateCookiePath('\x14'))
    t.assert.throws(() => validateCookiePath('\x15'))
    t.assert.throws(() => validateCookiePath('\x16'))
    t.assert.throws(() => validateCookiePath('\x17'))
    t.assert.throws(() => validateCookiePath('\x18'))
    t.assert.throws(() => validateCookiePath('\x19'))
    t.assert.throws(() => validateCookiePath('\x1A'))
    t.assert.throws(() => validateCookiePath('\x1B'))
    t.assert.throws(() => validateCookiePath('\x1C'))
    t.assert.throws(() => validateCookiePath('\x1D'))
    t.assert.throws(() => validateCookiePath('\x1E'))
    t.assert.throws(() => validateCookiePath('\x1F'))
    t.assert.throws(() => validateCookiePath('\x7F'))
  })

  test('should throw for ; character', (t) => {
    t.assert.throws(() => validateCookiePath(';'))
  })

  test('should pass for a printable character', t => {
    t.assert.strictEqual(validateCookiePath('A'), undefined)
    t.assert.strictEqual(validateCookiePath('Z'), undefined)
    t.assert.strictEqual(validateCookiePath('a'), undefined)
    t.assert.strictEqual(validateCookiePath('z'), undefined)
    t.assert.strictEqual(validateCookiePath('!'), undefined)
    t.assert.strictEqual(validateCookiePath(' '), undefined)
  })
})
