'use strict'

const { describe, test } = require('node:test')
const { isValidSubprotocol, parseExtensions } = require('../../lib/web/websocket/util')

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

describe('parseExtensions', () => {
  test('keeps whitespace out of parameter names and values', t => {
    // Optional whitespace is allowed around the ";" and "=" delimiters of an
    // extension header, so it must be stripped from both ends of every name
    // and value before the map is keyed on them.
    const cases = {
      'permessage-deflate; client_max_window_bits': [['permessage-deflate', ''], ['client_max_window_bits', '']],
      'permessage-deflate ; client_max_window_bits': [['permessage-deflate', ''], ['client_max_window_bits', '']],
      'permessage-deflate;\tclient_max_window_bits': [['permessage-deflate', ''], ['client_max_window_bits', '']],
      'permessage-deflate; server_max_window_bits = 10': [['permessage-deflate', ''], ['server_max_window_bits', '10']],
      'permessage-deflate; server_max_window_bits=10 ': [['permessage-deflate', ''], ['server_max_window_bits', '10']]
    }

    t.plan(Object.keys(cases).length)
    for (const [header, expected] of Object.entries(cases)) {
      t.assert.deepStrictEqual([...parseExtensions(header).entries()], expected, header)
    }
  })
})
