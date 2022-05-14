'use strict'

const { test } = require('tap')
const { parseUnparsedAttributes } = require('../../lib/cookie-store/parse')

test('Parsing set-cookie header(s)', (t) => {
  t.ok(true)
  t.end()
})

test('Parsing attributes', (t) => {
  t.same(parseUnparsedAttributes(''), {})

  t.end()
})
