'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Headers } = require('../..')

test('ByteString', (t) => {
  const name = Symbol('')
  const value = Symbol('')

  for (const method of [
    'get',
    'set',
    'delete',
    'append',
    'has'
  ]) {
    assert.throws(
      () => new Headers()[method](name, value),
      new TypeError(`Headers.${method}: name is a symbol, which cannot be converted to a DOMString.`)
    )
  }
})
