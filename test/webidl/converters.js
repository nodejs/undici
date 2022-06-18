'use strict'

const { test } = require('tap')
const { webidl } = require('../../lib/fetch/webidl')

test('sequence', (t) => {
  t.throws(() => {
    webidl.converters.sequence(true)
  }, TypeError)

  t.throws(() => {
    webidl.converters.sequence({})
  }, TypeError)

  t.throws(() => {
    webidl.converters.sequence({
      [Symbol.iterator]: 42
    })
  }, TypeError)

  t.throws(() => {
    webidl.converters.sequence({
      [Symbol.iterator] () {
        return {
          next: 'never!'
        }
      }
    })
  }, TypeError)

  const converter = webidl.sequenceConverter(
    webidl.converters.DOMString
  )

  t.same(converter([1, 2, 3]), ['1', '2', '3'])

  t.end()
})
