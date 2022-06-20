'use strict'

const { test } = require('tap')
const { webidl } = require('../../lib/fetch/webidl')

test('webidl.interfaceConverter', (t) => {
  class A {}
  class B {}

  const converter = webidl.interfaceConverter(A)

  t.throws(() => {
    converter(new B())
  }, TypeError)

  t.doesNotThrow(() => {
    converter(new A())
  })

  t.end()
})

test('webidl.dictionaryConverter', (t) => {
  t.test('extraneous keys are provided', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.USVString,
        defaultValue: 420,
        required: true
      }
    ])

    t.same(
      converter({
        a: 'b',
        key: 'string',
        c: 'd',
        get value () {
          return 6
        }
      }),
      { key: 'string' }
    )

    t.end()
  })

  t.test('defaultValue with key = null', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters['unsigned short'],
        defaultValue: 200
      }
    ])

    t.same(converter({ key: null }), { key: 0 })
    t.end()
  })

  t.test('no defaultValue and optional', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.ByteString
      }
    ])

    t.same(converter({ a: 'b', c: 'd' }), {})
    t.end()
  })

  t.end()
})
