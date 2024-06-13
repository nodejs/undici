'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { webidl } = require('../../lib/web/fetch/webidl')

test('webidl.interfaceConverter', () => {
  class A {}
  class B {}

  const converter = webidl.interfaceConverter(A)

  assert.throws(() => {
    converter(new B(), 'converter', 'converter')
  }, TypeError)

  assert.doesNotThrow(() => {
    converter(new A(), 'converter', 'converter')
  })
})

describe('webidl.dictionaryConverter', () => {
  test('extraneous keys are provided', () => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.USVString,
        defaultValue: 420,
        required: true
      }
    ])

    assert.deepStrictEqual(
      converter({
        a: 'b',
        key: 'string',
        c: 'd',
        get value () {
          return 6
        }
      }, 'converter', 'converter'),
      { key: 'string' }
    )
  })

  test('defaultValue with key = null', () => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters['unsigned short'],
        defaultValue: 200
      }
    ])

    assert.deepStrictEqual(converter({ key: null }, 'converter', 'converter'), { key: 0 })
  })

  test('no defaultValue and optional', () => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.ByteString
      }
    ])

    assert.deepStrictEqual(converter({ a: 'b', c: 'd' }, 'converter', 'converter'), {})
  })
})
