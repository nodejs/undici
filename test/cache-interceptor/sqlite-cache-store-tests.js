'use strict'

const { test } = require('node:test')
const { notEqual, strictEqual, deepStrictEqual } = require('node:assert')
const { rm } = require('node:fs/promises')
const FakeTimers = require('@sinonjs/fake-timers')
const { cacheStoreTests, writeBody, compareGetResults } = require('./cache-store-test-utils.js')
const { runtimeFeatures } = require('../../lib/util/runtime-features.js')

const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
cacheStoreTests(SqliteCacheStore, { skip: runtimeFeatures.has('sqlite') === false })

test('SqliteCacheStore works nicely with multiple stores', { skip: runtimeFeatures.has('sqlite') === false }, async (t) => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  const sqliteLocation = 'cache-interceptor.sqlite'

  const storeA = new SqliteCacheStore({
    location: sqliteLocation
  })

  const storeB = new SqliteCacheStore({
    location: sqliteLocation
  })

  t.after(async () => {
    storeA.close()
    storeB.close()
    await rm(sqliteLocation)
  })

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  const key = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: {}
  }

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
   */
  const value = {
    statusCode: 200,
    statusMessage: '',
    headers: { foo: 'bar' },
    cachedAt: Date.now(),
    staleAt: Date.now() + 10000,
    deleteAt: Date.now() + 20000
  }

  const body = [Buffer.from('asd'), Buffer.from('123')]

  {
    const writable = storeA.createWriteStream(key, value)
    notEqual(writable, undefined)
    writeBody(writable, body)
  }

  // Make sure we got the expected response from store a
  {
    const result = storeA.get(structuredClone(key))
    notEqual(result, undefined)
    await compareGetResults(result, value, body)
  }

  // Make sure we got the expected response from store b
  {
    const result = storeB.get(structuredClone(key))
    notEqual(result, undefined)
    await compareGetResults(result, value, body)
  }
})

test('SqliteCacheStore maxEntries', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const store = new SqliteCacheStore({
    maxCount: 10
  })

  for (let i = 0; i < 20; i++) {
    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
     */
    const key = {
      origin: 'localhost',
      path: '/' + i,
      method: 'GET',
      headers: {}
    }

    /**
     * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
     */
    const value = {
      statusCode: 200,
      statusMessage: '',
      headers: { foo: 'bar' },
      cachedAt: Date.now(),
      staleAt: Date.now() + 10000,
      deleteAt: Date.now() + 20000
    }

    const body = ['asd', '123']

    const writable = store.createWriteStream(key, value)
    notEqual(writable, undefined)
    writeBody(writable, body)
  }

  strictEqual(store.size <= 11, true)
})

test('SqliteCacheStore two writes', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const store = new SqliteCacheStore({
    maxCount: 10
  })

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  const key = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: {}
  }

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
   */
  const value = {
    statusCode: 200,
    statusMessage: '',
    headers: { foo: 'bar' },
    cachedAt: Date.now(),
    staleAt: Date.now() + 10000,
    deleteAt: Date.now() + 20000
  }

  const body = ['asd', '123']

  {
    const writable = store.createWriteStream(key, value)
    notEqual(writable, undefined)
    writeBody(writable, body)
  }

  {
    const writable = store.createWriteStream(key, value)
    notEqual(writable, undefined)
    writeBody(writable, body)
  }
})

test('SqliteCacheStore skips expired entry to find non-expired match', { skip: runtimeFeatures.has('sqlite') === false }, async (t) => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const clock = FakeTimers.install({
    shouldClearNativeTimers: true
  })
  t.after(() => clock.uninstall())

  const store = new SqliteCacheStore({
    maxCount: 100
  })

  const keyA = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: { 'x-vary': 'a' }
  }

  const valueA = {
    statusCode: 200,
    statusMessage: '',
    headers: { foo: 'bar' },
    vary: { 'x-vary': 'a' },
    cacheControlDirectives: {},
    cachedAt: Date.now(),
    staleAt: Date.now() + 1000,
    deleteAt: Date.now() + 1000
  }

  const bodyA = [Buffer.from('first')]

  {
    const writable = store.createWriteStream(keyA, valueA)
    notEqual(writable, undefined)
    writeBody(writable, bodyA)
  }

  // Advance past valueA's deleteAt
  clock.tick(2000)

  const keyB = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: { 'x-vary': 'b' }
  }

  const valueB = {
    statusCode: 200,
    statusMessage: '',
    headers: { foo: 'baz' },
    vary: { 'x-vary': 'b' },
    cacheControlDirectives: {},
    cachedAt: Date.now(),
    staleAt: Date.now() + 10000,
    deleteAt: Date.now() + 10000
  }

  const bodyB = [Buffer.from('second')]

  {
    const writable = store.createWriteStream(keyB, valueB)
    notEqual(writable, undefined)
    writeBody(writable, bodyB)
  }

  // The expired entry (valueA) is sorted first by deleteAt ASC; the
  // store must skip it and still return the matching valueB.
  const result = store.get(structuredClone(keyB))
  notEqual(result, undefined)
  await compareGetResults(result, valueB, bodyB)
})

test('SqliteCacheStore write & read', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const store = new SqliteCacheStore({
    maxCount: 10
  })

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
   */
  const key = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: {}
  }

  /**
   * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue & { body: Buffer }}
   */
  const value = {
    statusCode: 200,
    statusMessage: '',
    headers: { foo: 'bar' },
    cacheControlDirectives: { 'max-stale': 0 },
    cachedAt: Date.now(),
    staleAt: Date.now() + 10000,
    deleteAt: Date.now() + 20000,
    body: Buffer.from('asd'),
    etag: undefined,
    vary: undefined
  }

  store.set(key, value)

  deepStrictEqual(store.get(key), value)
})
