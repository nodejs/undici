'use strict'

const { test, describe } = require('node:test')
const { strictEqual } = require('node:assert')

const {
  toIMFDate
} = require('../../lib/web/cookies/util')

describe('toIMFDate', () => {
  test('should return the same as Date.prototype.toGMTString()', () => {
    for (let i = 1; i <= 1e6; i *= 2) {
      const date = new Date(i)
      strictEqual(toIMFDate(date), date.toGMTString())
    }
    for (let i = 0; i <= 1e6; i++) {
      const date = new Date(Math.trunc(Math.random() * 8640000000000000))
      strictEqual(toIMFDate(date), date.toGMTString())
    }
  })
})
