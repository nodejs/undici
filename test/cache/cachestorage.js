'use strict'

const { throws } = require('node:assert')
const { test } = require('node:test')
const { CacheStorage } = require('../../lib/web/cache/cachestorage')

test('constructor', () => {
  throws(() => new CacheStorage(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})
