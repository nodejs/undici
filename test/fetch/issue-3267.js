'use strict'

const { Headers } = require('../..')
const { test } = require('node:test')

test('Spreading a Headers object yields 0 symbols', (t) => {
  const baseHeaders = { 'x-foo': 'bar' }

  const requestHeaders = new Headers({ 'Content-Type': 'application/json' })
  const headers = {
    ...baseHeaders,
    ...requestHeaders
  }

  t.assert.deepStrictEqual(headers, { 'x-foo': 'bar' })
  t.assert.doesNotThrow(() => new Headers(headers))
})
