'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { normalizeHeaders } = require('../../lib/util/cache')

test('normalizeHeaders handles plain object headers with polluted Object.prototype[Symbol.iterator]', (t) => {
  const { strictEqual } = tspl(t, { plan: 2 })

  const originalIterator = Object.prototype[Symbol.iterator]
  // eslint-disable-next-line no-extend-native
  Object.prototype[Symbol.iterator] = function * () {}

  try {
    const headers = normalizeHeaders({
      headers: {
        Authorization: 'Bearer token',
        'X-Test': 'ok'
      }
    })

    strictEqual(headers.authorization, 'Bearer token')
    strictEqual(headers['x-test'], 'ok')
  } finally {
    if (originalIterator === undefined) {
      delete Object.prototype[Symbol.iterator]
    } else {
      // eslint-disable-next-line no-extend-native
      Object.prototype[Symbol.iterator] = originalIterator
    }
  }
})

test('normalizeHeaders handles headers from Map', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({
    headers: new Map([
      ['X-Test', 'ok']
    ])
  })

  strictEqual(headers['x-test'], 'ok')
})
