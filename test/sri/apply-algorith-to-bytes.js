'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')

const { applyAlgorithmToBytes } = require('../../lib/web/sri/sri')

let crypto = null

let skip
try {
  crypto = require('node:crypto')
  skip = false
} catch {
  skip = 'crypto not available'
}

describe('applyAlgorithmToBytes', () => {
  test('valid sha256', { skip }, () => {
    const bytes = Buffer.from('Hello world!')
    const validSha256Base64 = crypto.createHash('sha256').update(bytes).digest('base64')
    const result = applyAlgorithmToBytes('sha256', Buffer.from('Hello world!'))
    assert.strictEqual(result, validSha256Base64)
  })
  test('valid sha384', { skip }, () => {
    const bytes = Buffer.from('Hello world!')
    const validSha384Base64 = crypto.createHash('sha384').update(bytes).digest('base64')
    const result = applyAlgorithmToBytes('sha384', Buffer.from('Hello world!'))
    assert.strictEqual(result, validSha384Base64)
  })
  test('valid sha512', { skip }, () => {
    const bytes = Buffer.from('Hello world!')
    const validSha512Base64 = crypto.createHash('sha512').update(bytes).digest('base64')
    const result = applyAlgorithmToBytes('sha512', Buffer.from('Hello world!'))
    assert.strictEqual(result, validSha512Base64)
  })
})
