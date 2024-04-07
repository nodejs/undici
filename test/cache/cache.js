'use strict'

const { throws } = require('node:assert')
const { test } = require('node:test')
const { Cache } = require('../../lib/web/cache/cache')

test('constructor', () => {
  throws(() => new Cache(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})
