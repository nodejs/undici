'use strict'

const { describe, test } = require('node:test')
const { isValidSubprotocol } = require('../../lib/web/websocket/util')

describe('isValidSubprotocol', () => {
  test('empty string returns false', t => {
    t.plan(1)
    t.assert.strictEqual(isValidSubprotocol(''), false)
  })

  test('simple valid value returns false', t => {
    t.plan(1)
    t.assert.strictEqual(isValidSubprotocol('chat'), true)
  })

  test('empty string returns false', t => {
    t.plan(1)
    t.assert.strictEqual(isValidSubprotocol(''), false)
  })

  test('value with "(),/:;<=>?@[\\]{} returns false', t => {
    const chars = '"(),/:;<=>?@[\\]{}'
    t.plan(17)

    for (let i = 0; i < chars.length; ++i) {
      t.assert.strictEqual(isValidSubprotocol('valid' + chars[i]), false)
    }
  })
})
