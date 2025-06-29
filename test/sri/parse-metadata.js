'use strict'

const assert = require('node:assert')
const { createHash } = require('node:crypto')
const { test, describe } = require('node:test')

const { parseMetadata } = require('../../lib/web/sri/sri')

let skip
try {
  require('node:crypto')
  skip = false
} catch {
  skip = 'crypto not available'
}

describe('parseMetadata', () => {
  test('should parse valid metadata with option', { skip }, () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} !@ sha384-${hash384} !@ sha512-${hash512} !@`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should parse valid metadata with non ASCII chars option', { skip }, () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} !© sha384-${hash384} !€ sha512-${hash512} !µ`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should parse valid metadata without option', { skip }, () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const hash384 = createHash('sha384').update(body).digest('base64')
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} sha384-${hash384} sha512-${hash512}`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should not set hash as undefined when invalid base64 chars are provided', { skip }, () => {
    const body = 'Hello world!'
    const hash256 = createHash('sha256').update(body).digest('base64')
    const invalidHash384 = 'zifp5hE1Xl5LQQqQz[]Bq/iaq9Wb6jVb//T7EfTmbXD2aEP5c2ZdJr9YTDfcTE1ZH+'
    const hash512 = createHash('sha512').update(body).digest('base64')

    const validMetadata = `sha256-${hash256} sha384-${invalidHash384} sha512-${hash512}`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: invalidHash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })
})
