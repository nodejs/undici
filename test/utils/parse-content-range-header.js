'use strict'

const { strictEqual, deepStrictEqual } = require('node:assert')
const { test, describe } = require('node:test')
const { parseContentRangeHeader } = require('../../lib/core/util')

describe('parseContentRangeHeader', () => {
  test('empty string', () => {
    deepStrictEqual(parseContentRangeHeader(''), { start: 0, end: null, size: null })
    strictEqual(Object.isFrozen(parseContentRangeHeader('')), true)
  })

  test('undefined', () => {
    deepStrictEqual(parseContentRangeHeader(), { start: 0, end: null, size: null })
    strictEqual(Object.isFrozen(parseContentRangeHeader()), true)
  })

  test('null', () => {
    deepStrictEqual(parseContentRangeHeader(), { start: 0, end: null, size: null })
    strictEqual(Object.isFrozen(parseContentRangeHeader()), true)
  })

  test('invalid', () => {
    deepStrictEqual(parseContentRangeHeader('invalid'), null)
  })

  test('bytes */*', () => {
    deepStrictEqual(parseContentRangeHeader('bytes */*'), null)
  })

  test('bytes 0-2', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 0-2'), null)
  })

  test('bytes 0-2/', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 0-2/'), null)
  })

  test('bytes 0-400/400', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 0-400/400'), { start: 0, end: 400, size: 400 })
  })

  test('bytes 1-400/400', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 1-400/400'), { start: 1, end: 400, size: 400 })
  })

  test('bytes 1-400/*', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 1-400/*'), { start: 1, end: 400, size: null })
  })

  test('bytes 1-400/0', () => {
    deepStrictEqual(parseContentRangeHeader('bytes 1-400/0'), { start: 1, end: 400, size: 0 })
  })

  test('bytes */400', () => {
    deepStrictEqual(parseContentRangeHeader('bytes */400'), { start: 0, end: null, size: 400 })
  })
})
