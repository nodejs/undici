'use strict'

const undici = require('../..')
const { test } = require('node:test')
const assert = require('node:assert')

test('spreading web classes yields empty objects', (t) => {
  for (const object of [
    new undici.FormData(),
    new undici.Response(null),
    new undici.Request('http://a')
  ]) {
    assert.deepStrictEqual({ ...object }, {})
  }
})
