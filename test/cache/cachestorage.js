'use strict'

const { test } = require('node:test')
const { CacheStorage } = require('../../lib/web/cache/cachestorage')

test('constructor', (t) => {
  t.assert.throws(() => new CacheStorage(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})
