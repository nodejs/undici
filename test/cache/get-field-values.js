'use strict'

const { deepStrictEqual, throws } = require('node:assert')
const { test } = require('node:test')
const { getFieldValues } = require('../../lib/web/cache/util')

test('getFieldValues', () => {
  throws(() => getFieldValues(null), {
    name: 'AssertionError',
    message: 'The expression evaluated to a falsy value:\n\n  assert(header !== null)\n'
  })
  deepStrictEqual(getFieldValues(''), [])
  deepStrictEqual(getFieldValues('foo'), ['foo'])
  deepStrictEqual(getFieldValues('invälid'), [])
  deepStrictEqual(getFieldValues('foo, bar'), ['foo', 'bar'])
  deepStrictEqual(getFieldValues('foo, bar, baz'), ['foo', 'bar', 'baz'])
  deepStrictEqual(getFieldValues('foo, bar, baz, '), ['foo', 'bar', 'baz'])
  deepStrictEqual(getFieldValues('foo, bar, baz, , '), ['foo', 'bar', 'baz'])
})
