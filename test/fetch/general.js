'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const {
  File,
  FormData,
  Headers,
  Request,
  Response
} = require('../../index')

test('Symbol.toStringTag descriptor', () => {
  for (const cls of [
    File,
    FormData,
    Headers,
    Request,
    Response
  ]) {
    const desc = Object.getOwnPropertyDescriptor(cls.prototype, Symbol.toStringTag)
    assert.deepStrictEqual(desc, {
      value: cls.name,
      writable: false,
      enumerable: false,
      configurable: true
    })
  }
})
