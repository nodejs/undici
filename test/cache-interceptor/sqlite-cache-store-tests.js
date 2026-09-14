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

  const maxCount = 10
  const store = new SqliteCacheStore({ maxCount })

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

  strictEqual(store.size <= maxCount, true)
})

test('SqliteCacheStore enforces maxCount after insert', { skip: runtimeFeatures.has('sqlite') === false }, () => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const store = new SqliteCacheStore({ maxCount: 1 })

  store.set(
    { origin: 'localhost', path: '/a', method: 'GET', headers: {} },
    {
      statusCode: 200,
      statusMessage: '',
      headers: {},
      cachedAt: Date.now(),
      staleAt: Date.now() + 10_000,
      deleteAt: Date.now() + 20_000,
      body: Buffer.from('a')
    }
  )

  store.set(
    { origin: 'localhost', path: '/b', method: 'GET', headers: {} },
    {
      statusCode: 200,
      statusMessage: '',
      headers: {},
      cachedAt: Date.now() + 1,
      staleAt: Date.now() + 10_001,
      deleteAt: Date.now() + 20_001,
      body: Buffer.from('b')
    }
  )

  strictEqual(store.size, 1)
  strictEqual(store.get({ origin: 'localhost', path: '/a', method: 'GET', headers: {} }), undefined)
  notEqual(store.get({ origin: 'localhost', path: '/b', method: 'GET', headers: {} }), undefined)
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

test('SqliteCacheStore prune evicts oldest entries first', { skip: runtimeFeatures.has('sqlite') === false }, async () => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')

  const maxCount = 10
  const store = new SqliteCacheStore({ maxCount })

  const baseTime = Date.now()

  for (let i = 0; i < 20; i++) {
    const key = {
      origin: 'localhost',
      path: '/' + i,
      method: 'GET',
      headers: {}
    }

    const value = {
      statusCode: 200,
      statusMessage: '',
      headers: { foo: 'bar' },
      cachedAt: baseTime + i * 1000,
      staleAt: baseTime + i * 1000 + 60_000,
      deleteAt: baseTime + i * 1000 + 120_000,
      body: Buffer.from('x')
    }

    store.set(key, value)
  }

  // The most recently cached entry must still be present;
  // the oldest entry must have been evicted.
  const newest = store.get({ origin: 'localhost', path: '/19', method: 'GET', headers: {} })
  notEqual(newest, undefined)

  const oldest = store.get({ origin: 'localhost', path: '/0', method: 'GET', headers: {} })
  strictEqual(oldest, undefined)
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

test('SqliteCacheStore ignores expired Vary variants when a later one is still valid', { skip: runtimeFeatures.has('sqlite') === false }, () => {
  const store = new SqliteCacheStore()
  const now = Date.now()
  const baseKey = {
    origin: 'localhost',
    path: '/',
    method: 'GET'
  }

  store.set({
    ...baseKey,
    headers: {
      'accept-encoding': 'gzip'
    }
  }, {
    statusCode: 200,
    statusMessage: '',
    headers: {},
    vary: {
      'accept-encoding': 'gzip'
    },
    cachedAt: now - 2000,
    staleAt: now - 1000,
    deleteAt: now - 1,
    body: Buffer.from('expired gzip')
  })

  store.set({
    ...baseKey,
    headers: {
      'accept-encoding': 'br'
    }
  }, {
    statusCode: 200,
    statusMessage: '',
    headers: {},
    vary: {
      'accept-encoding': 'br'
    },
    cachedAt: now,
    staleAt: now + 1000,
    deleteAt: now + 2000,
    body: Buffer.from('valid br')
  })

  const result = store.get({
    ...baseKey,
    headers: {
      'accept-encoding': 'br'
    }
  })

  notEqual(result, undefined)
  strictEqual(result.body.toString(), 'valid br')
})

test('SqliteCacheStore updates vary when overwriting an existing row', { skip: runtimeFeatures.has('sqlite') === false }, () => {
  const store = new SqliteCacheStore()
  const now = Date.now()
  const baseKey = {
    origin: 'localhost',
    path: '/',
    method: 'GET'
  }

  store.set({
    ...baseKey,
    headers: {}
  }, {
    statusCode: 200,
    statusMessage: '',
    headers: {},
    cachedAt: now,
    staleAt: now + 1000,
    deleteAt: now + 2000,
    body: Buffer.from('initial')
  })

  store.set({
    ...baseKey,
    headers: {
      'accept-language': 'en'
    }
  }, {
    statusCode: 200,
    statusMessage: '',
    headers: {},
    vary: {
      'accept-language': 'en'
    },
    cachedAt: now,
    staleAt: now + 1000,
    deleteAt: now + 2000,
    body: Buffer.from('updated')
  })

  strictEqual(store.get({
    ...baseKey,
    headers: {
      'accept-language': 'fr'
    }
  }), undefined)
})

let hasZstd = false
try {
  hasZstd = typeof require('node:zlib').zstdCompressSync === 'function'
} catch {
  // zstd may be unavailable on older Node versions
}

const skipCompression = runtimeFeatures.has('sqlite') === false || hasZstd === false

test('SqliteCacheStore compresses big files with zstd', { skip: skipCompression }, async (t) => {
  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  const sqliteLocation = 'cache-interceptor-compressed.sqlite'

  const store = new SqliteCacheStore({
    location: sqliteLocation,
    compressThreshold: 1024
  })

  let storeClosed = false
  t.after(async () => {
    if (!storeClosed) {
      store.close()
    }
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

  // A body larger than compressThreshold must be stored compressed and
  // decompressed when read back.
  const bigBody = Buffer.from('a'.repeat(10_000))
  store.set({ ...key, path: '/big' }, { ...value, body: bigBody })

  {
    const result = store.get(structuredClone({ ...key, path: '/big' }))
    notEqual(result, undefined)
    deepStrictEqual(result.body, bigBody)
  }

  // A body smaller than compressThreshold must be stored uncompressed.
  const smallBody = Buffer.from('small')
  store.set({ ...key, path: '/small' }, { ...value, body: smallBody })

  {
    const result = store.get(structuredClone({ ...key, path: '/small' }))
    notEqual(result, undefined)
    deepStrictEqual(result.body, smallBody)
  }

  // A compressible mime type (application/json) must be compressed even when
  // the body is below compressThreshold.
  const jsonBody = Buffer.from('{"key":"value"}'.repeat(20))
  store.set({ ...key, path: '/json' }, { ...value, headers: { 'content-type': 'application/json' }, body: jsonBody })

  {
    const result = store.get(structuredClone({ ...key, path: '/json' }))
    notEqual(result, undefined)
    deepStrictEqual(result.body, jsonBody)
  }

  // Inspect the raw rows to make sure compression actually happened.
  store.close()
  storeClosed = true
  const DatabaseSync = require('node:sqlite').DatabaseSync
  const db = new DatabaseSync(sqliteLocation)
  const rows = db.prepare('SELECT compressed, body FROM cacheInterceptorV4 ORDER BY id').all()
  db.close()

  strictEqual(rows.length, 3)
  strictEqual(rows[0].compressed, 'zstd')
  strictEqual(rows[0].body.byteLength < bigBody.byteLength, true)
  strictEqual(rows[1].compressed, null)
  strictEqual(Buffer.from(rows[1].body).equals(smallBody), true)
  strictEqual(rows[2].compressed, 'zstd')
  strictEqual(rows[2].body.byteLength < jsonBody.byteLength, true)
})
