'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { Headers, MessageEvent } = require('../..')

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
      new TypeError(`Headers.${method}: name is a symbol, which cannot be converted to a ByteString.`)
    )
  }
})

describe('dictionary converters', () => {
  test('error message retains property name', () => {
    assert.throws(
      () => new MessageEvent('message', { source: 1 }),
      new TypeError('MessageEvent constructor: Expected eventInitDict.source ("1") to be an instance of MessagePort.')
    )
  })
})

describe('sequence converters', () => {
  test('retains index', () => {
    const { port1 } = new MessageChannel()

    assert.throws(
      () => new MessageEvent('type', { ports: [{}] }),
      new TypeError('MessageEvent constructor: Expected eventInitDict.ports[0] ("{}") to be an instance of MessagePort.')
    )

    assert.throws(
      () => new MessageEvent('type', { ports: [port1, {}] }),
      new TypeError('MessageEvent constructor: Expected eventInitDict.ports[1] ("{}") to be an instance of MessagePort.')
    )
  })
})
