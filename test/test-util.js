'use strict'

const tap = require('tap')
const { getPath } = require('../lib/core/util')

tap.test('getPath', t => {
  t.plan(4)

  t.strictEqual(getPath({ path: 'undici' }), 'undici', 'returns path property')
  t.strictEqual(getPath({ pathname: 'undici' }), 'undici', 'returns pathname and defaults search to empty string')
  t.strictEqual(getPath({ pathname: 'undici', search: '?foo=bar' }), 'undici?foo=bar', 'concats pathname and search props')
  t.strictEqual(getPath({ search: '?foo=bar' }), '/?foo=bar', 'defaults pathname to / and appends search')
})
