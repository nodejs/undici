'use strict'

const { test } = require('node:test')
const { Cache } = require('../../lib/web/cache/cache')

test('constructor', (t) => {
  t.assert.throws(() => new Cache(null), {
    name: 'TypeError',
    message: 'TypeError: Illegal constructor'
  })
})
