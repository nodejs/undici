'use strict'

const tap = require('tap')
const { getPath, checkForWeakRefAndFinalizationRegistrySupport } = require('../lib/core/util')

tap.test('getPath', t => {
  t.plan(4)

  t.strictEqual(getPath({ path: 'undici' }), 'undici', 'returns path property')
  t.strictEqual(getPath({ pathname: 'undici' }), 'undici', 'returns pathname and defaults search to empty string')
  t.strictEqual(getPath({ pathname: 'undici', search: '?foo=bar' }), 'undici?foo=bar', 'concats pathname and search props')
  t.strictEqual(getPath({ search: '?foo=bar' }), '/?foo=bar', 'defaults pathname to / and appends search')
})

const SKIP = typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined'

tap.test('checkForWeakRefAndFinalizationRegistrySupport', t => {
  t.plan(1)

  if (SKIP) {
    t.throw(() => checkForWeakRefAndFinalizationRegistrySupport())
  } else {
    t.notThrow(() => checkForWeakRefAndFinalizationRegistrySupport())
  }
})
