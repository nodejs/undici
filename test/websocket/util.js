'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const { isValidSubprotocol } = require('../../lib/web/websocket/util')

describe('isValidSubprotocol', () => {
  test('empty string returns false', t => {
    t = tspl(t, { plan: 1 })
    t.strictEqual(isValidSubprotocol(''), false)
  })

  test('simple valid value returns false', t => {
    t = tspl(t, { plan: 1 })
    t.strictEqual(isValidSubprotocol('chat'), true)
  })

  test('empty string returns false', t => {
    t = tspl(t, { plan: 1 })
    t.strictEqual(isValidSubprotocol(''), false)
  })

  test('value with "(),/:;<=>?@[\\]{} returns false', t => {
    const chars = '"(),/:;<=>?@[\\]{}'
    t = tspl(t, { plan: 17 })

    for (let i = 0; i < chars.length; ++i) {
      t.strictEqual(isValidSubprotocol('valid' + chars[i]), false)
    }
  })
})
