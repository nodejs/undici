'use strict'

const { Headers } = require('../..')
const { test } = require('node:test')
const assert = require('node:assert')

test('Spreading a Headers object yields 0 symbols', (t) => {
  const baseHeaders = { 'x-foo': 'bar' }

  const requestHeaders = new Headers({ 'Content-Type': 'application/json' })
  const headers = {
    ...baseHeaders,
    ...requestHeaders
  }

  assert.deepStrictEqual(headers, { 'x-foo': 'bar' })
  assert.doesNotThrow(() => new Headers(headers))
})
