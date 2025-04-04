'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { parseOrigin } = require('../lib/core/util')

// Test cases for parseOrigin functionality
test('parseOrigin allows URLs with paths and rejects invalid ones', async (t) => {
  // Valid URL with path
  const validUrl = 'https://api.domain.com/elastic'
  const result = parseOrigin(validUrl)
  assert.strictEqual(result.href, validUrl, 'Should return the input URL with the path for valid cases')

  // Invalid URL with query string
  const invalidQueryUrl = 'https://api.domain.com/elastic?query=test'
  assert.throws(
    () => parseOrigin(invalidQueryUrl),
    /InvalidArgumentError/,
    'Should throw InvalidArgumentError for URLs with query strings'
  )

  // Invalid URL with fragment
  const invalidFragmentUrl = 'https://api.domain.com/elastic#section'
  assert.throws(
    () => parseOrigin(invalidFragmentUrl),
    /InvalidArgumentError/,
    'Should throw InvalidArgumentError for URLs with fragments'
  )

  // Valid URL without path
  const validSimpleUrl = 'https://api.domain.com'
  const simpleResult = parseOrigin(validSimpleUrl)
  assert.strictEqual(simpleResult.href, `${validSimpleUrl}/`, 'Should return the input URL with the trailing slash')
})
