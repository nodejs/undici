'use strict'

const { test } = require('node:test')
const { parseMetadata } = require('../../lib/web/subresource-integrity/subresource-integrity')
const { runtimeFeatures } = require('../../lib/util/runtime-features')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

const skip = runtimeFeatures.has('crypto') === false
const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='

test('should ignore well-formed but unknown algorithm tokens', { skip }, (t) => {
  // An unknown algorithm token is skipped, leaving empty metadata. This is the
  // intended graceful-degradation behavior and must not be altered by case
  // normalization.
  const result = parseMetadata(`sha1024-${hash256}`)

  t.assert.deepEqual(result, [])
})

test('request with case-insensitive integrity algorithm tokens (correct checksum)', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const hash384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'
  const hash512 = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  // The SRI spec defines validity using the token's ASCII-lowercase form, so
  // upper- and mixed-case spellings must be accepted like their lowercase
  // counterparts and enforce the same digest.
  const cases = [
    ['SHA256', hash256],
    ['Sha256', hash256],
    ['shA256', hash256],
    ['SHA384', hash384],
    ['Sha384', hash384],
    ['SHA512', hash512],
    ['sHa512', hash512]
  ]

  for (const [algorithm, hash] of cases) {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity: `${algorithm}-${hash}`
    })
    t.assert.strictEqual(body, await response.text())
  }
})

test('request with case-insensitive integrity algorithm tokens (incorrect checksum)', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash256Wrong = 'MWD71RGgcch4KOzmR6VMaqWh4VY7eonYmHWvemOtMno='
  const hash384Wrong = 'zxSYGGGjWi7iIZ9SmiTenQIQ+/nzPTd5bbesJhBTZvoYomj28rsVLXbUyJU/Yqob'
  const hash512Wrong = 'eC9loL1pd8AD1Btp9aHu+ymH5Rfnh64hiTYgyfeXy270KfjPQupBkhb2OeP35vZA8ofSBNJ01LzweDIhznuqaw=='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  const expectedError = new TypeError('fetch failed', {
    cause: new Error('integrity mismatch')
  })

  // The digest must still be enforced regardless of the spelling of the token.
  const cases = [
    ['SHA256', hash256Wrong],
    ['Sha256', hash256Wrong],
    ['shA256', hash256Wrong],
    ['SHA384', hash384Wrong],
    ['Sha384', hash384Wrong],
    ['SHA512', hash512Wrong],
    ['sHa512', hash512Wrong]
  ]

  for (const [algorithm, wrongHash] of cases) {
    await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
      integrity: `${algorithm}-${wrongHash}`
    }), expectedError)
  }

  // Control: a well-formed but genuinely unknown algorithm token must continue
  // to degrade gracefully (acts as if no integrity was provided), so it must
  // NOT be rejected by case normalization.
  await t.assert.doesNotReject(fetch(`http://localhost:${server.address().port}`, {
    integrity: 'sha1024-MWD71RGgcch4KOzmR6VMaqWh4VY7eonYmHWvemOtMno='
  }))
})

test('request with case-insensitive integrity algorithm tokens (strongest algorithm priority)', { skip }, async (t) => {
  const body = 'Hello world!'
  const hash256 = 'wFNeS+K3n/2TKRMFQ2v4iTFOSj+uwF7P/Lt98xrZ5Ro='
  const hash384 = 'hiVfosNuSzCWnq4X3DTHcsvr38WLWEA5AL6HYU6xo0uHgCY/JV615lypu7hkHMz+'
  const hash512 = '9s3ioPgZMUzd5V/CJ9jX2uPSjMVWIioKitZtkcytSq1glPUXohgjYMmqz2o9wyMWLLb9jN/+2w/gOPVehf+1tg=='
  const hash256Wrong = 'MWD71RGgcch4KOzmR6VMaqWh4VY7eonYmHWvemOtMno='
  const hash384Wrong = 'zxSYGGGjWi7iIZ9SmiTenQIQ+/nzPTd5bbesJhBTZvoYomj28rsVLXbUyJU/Yqob'
  const hash512Wrong = 'eC9loL1pd8AD1Btp9aHu+ymH5Rfnh64hiTYgyfeXy270KfjPQupBkhb2OeP35vZA8ofSBNJ01LzweDIhznuqaw=='

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end(body)
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  const expectedError = new TypeError('fetch failed', {
    cause: new Error('integrity mismatch')
  })

  // Only the strongest algorithm may be checked, regardless of the spelling
  // of any token. A correct digest for a weaker algorithm must not satisfy
  // metadata whose strongest algorithm has an incorrect digest.
  const downgradeCases = [
    `SHA256-${hash256} sha512-${hash512Wrong}`,
    `sha512-${hash512Wrong} SHA256-${hash256}`,
    `sha256-${hash256} SHA512-${hash512Wrong}`,
    `SHA512-${hash512Wrong} sha256-${hash256}`,
    `SHA256-${hash256} SHA512-${hash512Wrong}`,
    `Sha384-${hash384} sha512-${hash512Wrong}`,
    `sha256-${hash256} sHa384-${hash384Wrong}`
  ]

  for (const integrity of downgradeCases) {
    await t.assert.rejects(fetch(`http://localhost:${server.address().port}`, {
      integrity
    }), expectedError)
  }

  // Control: a correct digest for the strongest algorithm is accepted even
  // when a weaker algorithm has an incorrect digest.
  const strongestCorrectCases = [
    `SHA256-${hash256Wrong} sha512-${hash512}`,
    `sha512-${hash512} SHA256-${hash256Wrong}`,
    `sha256-${hash256Wrong} SHA512-${hash512}`,
    `SHA256-${hash256Wrong} Sha384-${hash384}`
  ]

  for (const integrity of strongestCorrectCases) {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      integrity
    })
    t.assert.strictEqual(body, await response.text())
  }
})
