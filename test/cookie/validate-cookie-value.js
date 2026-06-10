'use strict'

const { test, describe } = require('node:test')

const {
  validateCookieValue
} = require('../../lib/web/cookies/util')

describe('validateCookieValue', () => {
  test('should throw for CTLs', (t) => {
    t.assert.throws(() => validateCookieValue('\x00'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x01'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x02'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x03'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x04'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x05'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x06'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x07'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x08'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x09'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0A'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0B'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0C'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0D'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0E'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x0F'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x10'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x11'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x12'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x13'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x14'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x15'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x16'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x17'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x18'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x19'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1A'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1B'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1C'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1D'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1E'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x1F'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('\x7F'), new Error('Invalid cookie value'))
  })

  test('should throw for ; character', (t) => {
    t.assert.throws(() => validateCookieValue(';'), new Error('Invalid cookie value'))
  })

  test('should throw for " character', (t) => {
    t.assert.throws(() => validateCookieValue('"'), new Error('Invalid cookie value'))
  })

  test('should throw for , character', (t) => {
    t.assert.throws(() => validateCookieValue(','), new Error('Invalid cookie value'))
  })

  test('should throw for \\ character', (t) => {
    t.assert.throws(() => validateCookieValue('\\'), new Error('Invalid cookie value'))
  })

  test('should pass for a printable character', t => {
    t.assert.strictEqual(validateCookieValue('A'), undefined)
    t.assert.strictEqual(validateCookieValue('Z'), undefined)
    t.assert.strictEqual(validateCookieValue('a'), undefined)
    t.assert.strictEqual(validateCookieValue('z'), undefined)
    t.assert.strictEqual(validateCookieValue('!'), undefined)
    t.assert.strictEqual(validateCookieValue('='), undefined)
  })

  test('should handle strings wrapped in DQUOTE', t => {
    t.assert.strictEqual(validateCookieValue('""'), undefined)
    t.assert.strictEqual(validateCookieValue('"helloworld"'), undefined)
    t.assert.throws(() => validateCookieValue('"'), new Error('Invalid cookie value'))
    t.assert.throws(() => validateCookieValue('"""'), new Error('Invalid cookie value'))
  })
})
