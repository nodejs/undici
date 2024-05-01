'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { isASCIINumber, isValidLastEventId } = require('../../lib/web/eventsource/util')

test('isValidLastEventId', () => {
  assert.strictEqual(isValidLastEventId('valid'), true)
  assert.strictEqual(isValidLastEventId('in\u0000valid'), false)
  assert.strictEqual(isValidLastEventId('in\x00valid'), false)
  assert.strictEqual(isValidLastEventId('…'), true)
})

test('isASCIINumber', () => {
  assert.strictEqual(isASCIINumber('123'), true)
  assert.strictEqual(isASCIINumber(''), false)
  assert.strictEqual(isASCIINumber('123a'), false)
})
