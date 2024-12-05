'use strict'

const { test, skip } = require('node:test')
const { notEqual, strictEqual } = require('node:assert')
const { rm } = require('node:fs/promises')
const { cacheStoreTests, writeBody, compareGetResults } = require('./cache-store-test-utils.js')

let hasSqlite = false
try {
  require('node:sqlite')

  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  cacheStoreTests(SqliteCacheStore)
  hasSqlite = true
} catch (err) {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    skip('`node:sqlite` not present')
  } else {
    throw err
  }
}

test('SqliteCacheStore works nicely with multiple stores', async (t) => {
  if (!hasSqlite) {
    t.skip()
    return
  }

  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  const sqliteLocation = 'cache-interceptor.sqlite'

  const storeA = new SqliteCacheStore({
    location: sqliteLocation
  })

  const storeB = new SqliteCacheStore({
    location: sqliteLocation
  })

  t.after(async () => {
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

test('SqliteCacheStore maxEntries', async (t) => {
  if (!hasSqlite) {
    t.skip()
    return
  }

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

test('SqliteCacheStore two writes', async (t) => {
  if (!hasSqlite) {
    t.skip()
    return
  }

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
