'use strict'

const { test } = require('node:test')
const { isASCIINumber, isValidLastEventId } = require('../../lib/web/eventsource/util')

test('isValidLastEventId', (t) => {
  t.assert.strictEqual(isValidLastEventId('valid'), true)
  t.assert.strictEqual(isValidLastEventId('in\u0000valid'), false)
  t.assert.strictEqual(isValidLastEventId('in\x00valid'), false)
  t.assert.strictEqual(isValidLastEventId('…'), true)
})

test('isASCIINumber', (t) => {
  t.assert.strictEqual(isASCIINumber('123'), true)
  t.assert.strictEqual(isASCIINumber(''), false)
  t.assert.strictEqual(isASCIINumber('123a'), false)
})
