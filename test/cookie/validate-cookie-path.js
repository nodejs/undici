'use strict'

const { test, describe } = require('node:test')
const { throws, strictEqual } = require('node:assert')

const {
  validateCookiePath
} = require('../../lib/web/cookies/util')

describe('validateCookiePath', () => {
  test('should throw for CTLs', () => {
    throws(() => validateCookiePath('\x00'))
    throws(() => validateCookiePath('\x01'))
    throws(() => validateCookiePath('\x02'))
    throws(() => validateCookiePath('\x03'))
    throws(() => validateCookiePath('\x04'))
    throws(() => validateCookiePath('\x05'))
    throws(() => validateCookiePath('\x06'))
    throws(() => validateCookiePath('\x07'))
    throws(() => validateCookiePath('\x08'))
    throws(() => validateCookiePath('\x09'))
    throws(() => validateCookiePath('\x0A'))
    throws(() => validateCookiePath('\x0B'))
    throws(() => validateCookiePath('\x0C'))
    throws(() => validateCookiePath('\x0D'))
    throws(() => validateCookiePath('\x0E'))
    throws(() => validateCookiePath('\x0F'))
    throws(() => validateCookiePath('\x10'))
    throws(() => validateCookiePath('\x11'))
    throws(() => validateCookiePath('\x12'))
    throws(() => validateCookiePath('\x13'))
    throws(() => validateCookiePath('\x14'))
    throws(() => validateCookiePath('\x15'))
    throws(() => validateCookiePath('\x16'))
    throws(() => validateCookiePath('\x17'))
    throws(() => validateCookiePath('\x18'))
    throws(() => validateCookiePath('\x19'))
    throws(() => validateCookiePath('\x1A'))
    throws(() => validateCookiePath('\x1B'))
    throws(() => validateCookiePath('\x1C'))
    throws(() => validateCookiePath('\x1D'))
    throws(() => validateCookiePath('\x1E'))
    throws(() => validateCookiePath('\x1F'))
    throws(() => validateCookiePath('\x7F'))
  })

  test('should throw for ; character', () => {
    throws(() => validateCookiePath(';'))
  })

  test('should pass for a printable character', t => {
    strictEqual(validateCookiePath('A'), undefined)
    strictEqual(validateCookiePath('Z'), undefined)
    strictEqual(validateCookiePath('a'), undefined)
    strictEqual(validateCookiePath('z'), undefined)
    strictEqual(validateCookiePath('!'), undefined)
    strictEqual(validateCookiePath(' '), undefined)
  })
})
