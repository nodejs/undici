'use strict'

const { test } = require('node:test')
const { getFieldValues } = require('../../lib/web/cache/util')

test('getFieldValues', (t) => {
  t.assert.throws(() => getFieldValues(null), {
    name: 'AssertionError',
    message: 'The expression evaluated to a falsy value:\n\n  assert(header !== null)\n'
  })
  t.assert.deepStrictEqual(getFieldValues(''), [])
  t.assert.deepStrictEqual(getFieldValues('foo'), ['foo'])
  t.assert.deepStrictEqual(getFieldValues('invälid'), [])
  t.assert.deepStrictEqual(getFieldValues('foo, bar'), ['foo', 'bar'])
  t.assert.deepStrictEqual(getFieldValues('foo, bar, baz'), ['foo', 'bar', 'baz'])
  t.assert.deepStrictEqual(getFieldValues('foo, bar, baz, '), ['foo', 'bar', 'baz'])
  t.assert.deepStrictEqual(getFieldValues('foo, bar, baz, , '), ['foo', 'bar', 'baz'])
})
