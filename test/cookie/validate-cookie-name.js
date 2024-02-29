'use strict'

const { test, describe } = require('node:test')
const { throws, strictEqual } = require('node:assert')

const {
  validateCookieName
} = require('../../lib/web/cookies/util')

describe('validateCookieName', () => {
  test('should throw for CTLs', () => {
    throws(() => validateCookieName('\x00'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x01'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x02'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x03'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x04'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x05'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x06'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x07'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x08'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x09'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0A'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0B'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0C'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0D'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0E'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x0F'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x10'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x11'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x12'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x13'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x14'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x15'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x16'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x17'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x18'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x19'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1A'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1B'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1C'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1D'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1E'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x1F'), new Error('Invalid cookie name'))
    throws(() => validateCookieName('\x7F'), new Error('Invalid cookie name'))
  })

  test('should throw for " " character', () => {
    throws(() => validateCookieName(' '), new Error('Invalid cookie name'))
  })

  test('should throw for Horizontal Tab character', () => {
    throws(() => validateCookieName('\t'), new Error('Invalid cookie name'))
  })

  test('should throw for ; character', () => {
    throws(() => validateCookieName(';'), new Error('Invalid cookie name'))
  })

  test('should throw for " character', () => {
    throws(() => validateCookieName('"'), new Error('Invalid cookie name'))
  })

  test('should throw for , character', () => {
    throws(() => validateCookieName(','), new Error('Invalid cookie name'))
  })

  test('should throw for \\ character', () => {
    throws(() => validateCookieName('\\'), new Error('Invalid cookie name'))
  })

  test('should throw for ( character', () => {
    throws(() => validateCookieName('('), new Error('Invalid cookie name'))
  })

  test('should throw for ) character', () => {
    throws(() => validateCookieName(')'), new Error('Invalid cookie name'))
  })

  test('should throw for < character', () => {
    throws(() => validateCookieName('<'), new Error('Invalid cookie name'))
  })

  test('should throw for > character', () => {
    throws(() => validateCookieName('>'), new Error('Invalid cookie name'))
  })

  test('should throw for @ character', () => {
    throws(() => validateCookieName('@'), new Error('Invalid cookie name'))
  })

  test('should throw for : character', () => {
    throws(() => validateCookieName(':'), new Error('Invalid cookie name'))
  })

  test('should throw for / character', () => {
    throws(() => validateCookieName('/'), new Error('Invalid cookie name'))
  })

  test('should throw for [ character', () => {
    throws(() => validateCookieName('['), new Error('Invalid cookie name'))
  })

  test('should throw for ] character', () => {
    throws(() => validateCookieName(']'), new Error('Invalid cookie name'))
  })

  test('should throw for ? character', () => {
    throws(() => validateCookieName('?'), new Error('Invalid cookie name'))
  })

  test('should throw for = character', () => {
    throws(() => validateCookieName('='), new Error('Invalid cookie name'))
  })

  test('should throw for { character', () => {
    throws(() => validateCookieName('{'), new Error('Invalid cookie name'))
  })

  test('should throw for } character', () => {
    throws(() => validateCookieName('}'), new Error('Invalid cookie name'))
  })

  test('should pass for a printable character', t => {
    strictEqual(validateCookieName('A'), undefined)
    strictEqual(validateCookieName('Z'), undefined)
    strictEqual(validateCookieName('a'), undefined)
    strictEqual(validateCookieName('z'), undefined)
    strictEqual(validateCookieName('!'), undefined)
  })
})
