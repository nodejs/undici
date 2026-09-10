'use strict'

const { test, describe } = require('node:test')
const { throws, strictEqual } = require('node:assert')

const {
  validateCookieMaxAge
} = require('../../lib/web/cookies/util')

describe('validateCookieMaxAge', () => {
  test('0', () => {
    strictEqual(validateCookieMaxAge(0), undefined)
    strictEqual(validateCookieMaxAge(+0), undefined)
    strictEqual(validateCookieMaxAge(-0), undefined)
  })

  test('float', () => {
    throws(() => validateCookieMaxAge(3.15), Error('Invalid cookie max-age'))
  })

  test('integer value', () => {
    strictEqual(validateCookieMaxAge(2), undefined)
    strictEqual(validateCookieMaxAge(-2), undefined)
  })

  test('-Infinity', () => {
    throws(() => validateCookieMaxAge(-Infinity), Error('Invalid cookie max-age'))
  })

  test('Infinity', () => {
    throws(() => validateCookieMaxAge(Infinity), Error('Invalid cookie max-age'))
  })

  test('NaN', () => {
    throws(() => validateCookieMaxAge(NaN), Error('Invalid cookie max-age'))
  })
})
