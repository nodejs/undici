'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')

const { parseMetadata } = require('../../lib/web/subresource-integrity/subresource-integrity')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const skip = runtimeFeatures.has('crypto') === false

describe('parseMetadata', () => {
  /* Hash values generated with for "Hello world!" */
  const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const hash384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'
  const hash512 = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='

  test('should parse valid metadata with option', { skip }, () => {
    const validMetadata = `sha256-${hash256} !@ sha384-${hash384} !@ sha512-${hash512} !@`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should parse valid metadata with non ASCII chars option', { skip }, () => {
    const validMetadata = `sha256-${hash256} !© sha384-${hash384} !€ sha512-${hash512} !µ`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should parse valid metadata without option', { skip }, () => {
    const validMetadata = `sha256-${hash256} sha384-${hash384} sha512-${hash512}`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: hash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })

  test('should not set hash as undefined when invalid base64 chars are provided', { skip }, () => {
    const invalidHash384 = 'zifp5hE1Xl5LQQqQz[]Bq/iaq9Wb6jVb//T7EfTmbXD2aEP5c2ZdJr9YTDfcTE1ZH+'

    const validMetadata = `sha256-${hash256} sha384-${invalidHash384} sha512-${hash512}`
    const result = parseMetadata(validMetadata)

    assert.deepEqual(result, [
      { alg: 'sha256', val: hash256 },
      { alg: 'sha384', val: invalidHash384 },
      { alg: 'sha512', val: hash512 }
    ])
  })
})
