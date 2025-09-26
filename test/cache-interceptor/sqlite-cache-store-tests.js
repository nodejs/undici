'use strict'

const { test } = require('node:test')
const { notEqual, strictEqual, deepStrictEqual } = require('node:assert')
const { rm } = require('node:fs/promises')
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
