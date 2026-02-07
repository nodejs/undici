'use strict'

const { test } = require('node:test')
const { includesCredentials } = require('../../lib/web/fetch/util')

test('includesCredentials returns true for URL with both username and password', () => {
  const url = new URL('http://user:pass@example.com')
  require('node:assert').strictEqual(includesCredentials(url), true)
})

test('includesCredentials returns true for URL with only username', () => {
  const url = new URL('http://user@example.com')
  require('node:assert').strictEqual(includesCredentials(url), true)
})

test('includesCredentials returns true for URL with only password', () => {
  const url = new URL('http://:pass@example.com')
  require('node:assert').strictEqual(includesCredentials(url), true)
})

test('includesCredentials returns false for URL with no credentials', () => {
  const url = new URL('http://example.com')
  require('node:assert').strictEqual(includesCredentials(url), false)
})
