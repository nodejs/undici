'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')

const { bytesMatch } = require('../../lib/web/sri/sri')

let skip
try {
  require('node:crypto')
  skip = false
} catch {
  skip = 'crypto not available'
}

describe('bytesMatch', () => {
  test('valid sha256 and base64', { skip }, () => {
    const body = Buffer.from('Hello world!')

    const validSha256Base64 = `sha256-${body.toString('base64')}`
    assert.ok(bytesMatch(body, validSha256Base64))
  })
})
