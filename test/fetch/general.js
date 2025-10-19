'use strict'

const { test } = require('node:test')
const {
  FormData,
  Headers,
  Request,
  Response
} = require('../../index')

test('Symbol.toStringTag descriptor', (t) => {
  for (const cls of [
    FormData,
    Headers,
    Request,
    Response
  ]) {
    const desc = Object.getOwnPropertyDescriptor(cls.prototype, Symbol.toStringTag)
    t.assert.deepStrictEqual(desc, {
      value: cls.name,
      writable: false,
      enumerable: false,
      configurable: true
    })
  }
})
