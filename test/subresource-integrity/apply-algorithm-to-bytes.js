'use strict'

const { test, describe } = require('node:test')

const { applyAlgorithmToBytes } = require('../../lib/web/subresource-integrity/subresource-integrity')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const skip = runtimeFeatures.has('crypto') === false

describe('applyAlgorithmToBytes', () => {
  /* Hash values generated with for "Hello world!" */
  const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const hash384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'
  const hash512 = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='

  test('valid sha256', { skip }, (t) => {
    const result = applyAlgorithmToBytes('sha256', Buffer.from('Hello world!'))
    t.assert.strictEqual(result, hash256)
  })
  test('valid sha384', { skip }, (t) => {
    const result = applyAlgorithmToBytes('sha384', Buffer.from('Hello world!'))
    t.assert.strictEqual(result, hash384)
  })
  test('valid sha512', { skip }, (t) => {
    const result = applyAlgorithmToBytes('sha512', Buffer.from('Hello world!'))
    t.assert.strictEqual(result, hash512)
  })
})
