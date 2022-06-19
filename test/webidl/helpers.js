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
