'use strict'

const { test } = require('tap')
const {
  File,
  FormData,
  Headers,
  Request,
  Response
} = require('../../index')

test('Symbol.toStringTag descriptor', (t) => {
  for (const cls of [
    File,
    FormData,
    Headers,
    Request,
    Response
  ]) {
    const desc = Object.getOwnPropertyDescriptor(cls.prototype, Symbol.toStringTag)
    t.same(desc, {
      value: cls.name,
      writable: false,
      enumerable: false,
      configurable: true
    })
  }

  t.end()
})
