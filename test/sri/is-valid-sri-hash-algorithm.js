'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')

const { isValidSRIHashAlgorithm } = require('../../lib/web/subresource-integrity/subresource-integrity')

let skip
try {
  require('node:crypto')
  skip = false
} catch {
  skip = 'crypto not available'
}

describe('isValidSRIHashAlgorithm', () => {
  test('valid sha256', { skip }, () => {
    assert.ok(isValidSRIHashAlgorithm('sha256'))
  })
  test('valid sha384', { skip }, () => {
    assert.ok(isValidSRIHashAlgorithm('sha384'))
  })
  test('valid sha512', { skip }, () => {
    assert.ok(isValidSRIHashAlgorithm('sha512'))
  })
  test('invalid sha1024', () => {
    assert.ok(isValidSRIHashAlgorithm('sha1024') === false)
  })
})
