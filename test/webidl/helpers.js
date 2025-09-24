'use strict'

const { describe, test } = require('node:test')
const { webidl } = require('../../lib/web/webidl')

test('webidl.interfaceConverter', (t) => {
  class A {}
  class B {}

  const converter = webidl.interfaceConverter(webidl.util.MakeTypeAssertion(A))

  t.assert.throws(() => {
    converter(new B(), 'converter', 'converter')
  }, TypeError)

  t.assert.doesNotThrow(() => {
    converter(new A(), 'converter', 'converter')
  })

  t.test('interfaceConverters ignore Symbol.hasInstance', () => {
    class V {}

    Object.defineProperty(Blob.prototype, Symbol.hasInstance, {
      value: () => true
    })

    const blobConverter = webidl.interfaceConverter(webidl.is.Blob, 'Blob')

    t.assert.throws(() => blobConverter(new V()))
    t.assert.strictEqual(webidl.is.Blob(new V()), false)
  })
})

describe('webidl.dictionaryConverter', () => {
  test('extraneous keys are provided', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.USVString,
        defaultValue: 420,
        required: true
      }
    ])

    t.assert.deepStrictEqual(
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

  test('defaultValue with key = null', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters['unsigned short'],
        defaultValue: 200
      }
    ])

    t.assert.deepStrictEqual(converter({ key: null }, 'converter', 'converter'), { key: 0 })
  })

  test('no defaultValue and optional', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.ByteString
      }
    ])

    t.assert.deepStrictEqual(converter({ a: 'b', c: 'd' }, 'converter', 'converter'), {})
  })
})
