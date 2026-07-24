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

test('normalizeHeaders preserves repeated iterable headers', (t) => {
  const { ok, strictEqual } = tspl(t, { plan: 4 })

  const headers = normalizeHeaders({
    headers: [
      ['Cache-Control', 'no-store'],
      ['cache-control', 'max-age=60']
    ]
  })

  ok(Array.isArray(headers['cache-control']))
  strictEqual(headers['cache-control'][0], 'no-store')
  strictEqual(headers['cache-control'][1], 'max-age=60')
  strictEqual(headers['cache-control'].length, 2)
})

test('normalizeHeaders preserves repeated plain-object headers with different casing', (t) => {
  const { ok, strictEqual } = tspl(t, { plan: 4 })

  const headers = normalizeHeaders({
    headers: {
      'Cache-Control': 'no-store',
      'cache-control': 'max-age=60'
    }
  })

  ok(Array.isArray(headers['cache-control']))
  strictEqual(headers['cache-control'][0], 'no-store')
  strictEqual(headers['cache-control'][1], 'max-age=60')
  strictEqual(headers['cache-control'].length, 2)
})

test('normalizeHeaders handles empty array', (t) => {
  const { deepEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({ headers: [] })

  deepEqual(headers, {})
})

test('normalizeHeaders handles flat alternating array (single header)', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({
    headers: ['host', 'localhost']
  })

  strictEqual(headers.host, 'localhost')
})

test('normalizeHeaders handles flat alternating array (multiple headers)', (t) => {
  const { deepEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({
    headers: ['host', 'localhost', 'content-type', 'application/json']
  })

  deepEqual(headers, { host: 'localhost', 'content-type': 'application/json' })
})

test('normalizeHeaders handles flat alternating array with array values', (t) => {
  const { deepEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({
    headers: ['accept', ['application/json', 'text/plain']]
  })

  deepEqual(headers, { accept: ['application/json', 'text/plain'] })
})

test('normalizeHeaders handles array-of-pairs (existing behavior)', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  const headers = normalizeHeaders({
    headers: [['host', 'localhost']]
  })

  strictEqual(headers.host, 'localhost')
})

test('normalizeHeaders throws on odd-length flat array', (t) => {
  const { throws } = require('node:assert')

  throws(() => normalizeHeaders({ headers: ['host'] }), {
    message: 'opts.headers is not a valid header map'
  })
})

test('normalizeHeaders throws on non-string key in flat array', (t) => {
  const { throws } = require('node:assert')

  throws(() => normalizeHeaders({ headers: [42, 'value'] }), {
    message: 'opts.headers is not a valid header map'
  })
})
