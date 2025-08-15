'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')

const { bytesMatch } = require('../../lib/web/subresource-integrity/subresource-integrity')

let crypto = null

let skip
try {
  crypto = require('node:crypto')
  skip = false
} catch {
  skip = 'crypto not available'
}

describe('bytesMatch', () => {
  test('valid sha256 and base64', { skip }, () => {
    const data = Buffer.from('Hello world!')

    const validSha256Base64 = `sha256-${crypto.hash('sha256', data, 'base64')}`
    assert.ok(bytesMatch(data, validSha256Base64))
  })
})
