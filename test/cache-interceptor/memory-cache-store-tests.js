'use strict'

const { test } = require('node:test')
const { equal, deepStrictEqual } = require('node:assert')
const MemoryCacheStore = require('../../lib/cache/memory-cache-store')
const { cacheStoreTests } = require('./cache-store-test-utils.js')

cacheStoreTests(MemoryCacheStore)

test('evicts entries when a single entry is stored per key', async () => {
  const store = new MemoryCacheStore({ maxSize: 1000, maxCount: 5 })

  // Store one response per distinct key — the case where the old eviction
  // logic (entries.length / 2) silently evicted nothing and the limits were
  // never enforced.
  for (let i = 0; i < 100; i++) {
    const writeStream = store.createWriteStream(
      { origin: 'test', path: `/test-${i}`, method: 'GET' },
      {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 60000,
        deleteAt: Date.now() + 120000
      }
    )
    writeStream.write('X'.repeat(100))
    writeStream.end()
  }

  equal(store.size <= 1000, true, 'Store should be evicted back below maxSize')
  equal(store.isFull(), false, 'Store should not be full after eviction')
})

test('default limits prevent memory leaks', async () => {
  const store = new MemoryCacheStore() // Uses new defaults

  // Test that maxCount default (1024) is enforced
  for (let i = 0; i < 1025; i++) {
    const writeStream = store.createWriteStream(
      { origin: 'test', path: `/test-${i}`, method: 'GET' },
      {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 60000,
        deleteAt: Date.now() + 120000
      }
    )
    writeStream.write('test data')
    writeStream.end()
  }

  // After exceeding the maxCount default, eviction must bring the store back
  // under the limit rather than leaving it full.
  equal(store.isFull(), false, 'Store should be evicted back under maxCount default')
})

test('default maxEntrySize prevents large entries', async () => {
  const store = new MemoryCacheStore() // Uses new defaults

  // Create entry larger than default maxEntrySize (5MB)
  const largeData = Buffer.allocUnsafe(5242881) // 5MB + 1 byte

  const writeStream = store.createWriteStream(
    { origin: 'test', path: '/large', method: 'GET' },
    {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      cachedAt: Date.now(),
      staleAt: Date.now() + 60000,
      deleteAt: Date.now() + 120000
    }
  )

  writeStream.write(largeData)
  writeStream.end()

  // Entry should not be cached due to maxEntrySize limit
  const result = store.get({ origin: 'test', path: '/large', method: 'GET', headers: {} })
  equal(result, undefined, 'Large entry should not be cached due to maxEntrySize limit')
})

test('size getter returns correct total size', async () => {
  const store = new MemoryCacheStore()
  const testData = 'test data'

  equal(store.size, 0, 'Initial size should be 0')

  const writeStream = store.createWriteStream(
    { origin: 'test', path: '/', method: 'GET' },
    {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      cachedAt: Date.now(),
      staleAt: Date.now() + 1000,
      deleteAt: Date.now() + 2000
    }
  )

  writeStream.write(testData)
  writeStream.end()

  equal(store.size, testData.length, 'Size should match written data length')
})

test('isFull returns false when under limits', () => {
  const store = new MemoryCacheStore({
    maxSize: 1000,
    maxCount: 10
  })

  equal(store.isFull(), false, 'Should not be full when empty')
})

test('evicts entry back under limits when maxSize reached', async () => {
  const maxSize = 10
  const store = new MemoryCacheStore({ maxSize })
  const testData = 'x'.repeat(maxSize + 1) // Exceed maxSize

  const writeStream = store.createWriteStream(
    { origin: 'test', path: '/', method: 'GET' },
    {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      cachedAt: Date.now(),
      staleAt: Date.now() + 1000,
      deleteAt: Date.now() + 2000
    }
  )

  writeStream.write(testData)
  writeStream.end()

  // The entry exceeds maxSize, so eviction must remove it and bring the store
  // back under the limit.
  equal(store.size <= maxSize, true, 'Store should be evicted back below maxSize')
  equal(store.isFull(), false, 'Store should not be full after eviction')
})

test('evicts entries back under limits when maxCount reached', async () => {
  const maxCount = 2
  const store = new MemoryCacheStore({ maxCount })

  // Add maxCount + 1 entries
  for (let i = 0; i <= maxCount; i++) {
    const writeStream = store.createWriteStream(
      { origin: 'test', path: `/${i}`, method: 'GET' },
      {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        deleteAt: Date.now() + 2000
      }
    )
    writeStream.end('test')
  }

  // After exceeding maxCount, eviction must bring the store back under the
  // limit rather than leaving it full.
  equal(store.isFull(), false, 'Store should not be full after eviction')
})

test('emits maxSizeExceeded event when limits exceeded', async () => {
  const maxSize = 10
  const store = new MemoryCacheStore({ maxSize })

  let eventFired = false
  let eventPayload = null

  store.on('maxSizeExceeded', (payload) => {
    eventFired = true
    eventPayload = payload
  })

  const testData = 'x'.repeat(maxSize + 1) // Exceed maxSize

  const writeStream = store.createWriteStream(
    { origin: 'test', path: '/', method: 'GET' },
    {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      cachedAt: Date.now(),
      staleAt: Date.now() + 1000,
      deleteAt: Date.now() + 2000
    }
  )

  writeStream.write(testData)
  writeStream.end()

  equal(eventFired, true, 'maxSizeExceeded event should fire')
  equal(typeof eventPayload, 'object', 'Event should have payload')
  equal(typeof eventPayload.size, 'number', 'Payload should have size')
  equal(typeof eventPayload.maxSize, 'number', 'Payload should have maxSize')
  equal(typeof eventPayload.count, 'number', 'Payload should have count')
  equal(typeof eventPayload.maxCount, 'number', 'Payload should have maxCount')
})

function writeEntry (store, path, { body = 'x', ttl = 60000, vary } = {}) {
  const now = Date.now()
  const writeStream = store.createWriteStream(
    { origin: 'test', path, method: 'GET', headers: vary },
    {
      statusCode: 200,
      statusMessage: 'OK',
      headers: {},
      vary,
      cachedAt: now,
      staleAt: now + ttl,
      deleteAt: now + ttl
    }
  )
  writeStream.end(body)
}

function hasEntry (store, path, headers = {}) {
  return store.get({ origin: 'test', path, method: 'GET', headers }) !== undefined
}

test('eviction removes the oldest entries and keeps the newest', () => {
  const store = new MemoryCacheStore({ maxCount: 10 })

  for (let i = 0; i < 11; i++) {
    writeEntry(store, `/${i}`)
  }

  const kept = []
  for (let i = 0; i < 11; i++) {
    if (hasEntry(store, `/${i}`)) kept.push(i)
  }
  deepStrictEqual(kept, [6, 7, 8, 9, 10])
})

test('eviction by maxSize removes the oldest entries and keeps the newest', () => {
  const store = new MemoryCacheStore({ maxSize: 1000 })

  for (let i = 0; i < 11; i++) {
    writeEntry(store, `/${i}`, { body: 'x'.repeat(100) })
  }

  equal(store.size, 500)
  equal(hasEntry(store, '/0'), false)
  equal(hasEntry(store, '/10'), true)
})

test('eviction treats a rewritten entry as the newest', () => {
  const store = new MemoryCacheStore({ maxCount: 4 })

  for (let i = 0; i < 4; i++) {
    writeEntry(store, `/${i}`)
  }
  writeEntry(store, '/0')
  writeEntry(store, '/4')

  deepStrictEqual([0, 1, 2, 3, 4].filter((i) => hasEntry(store, `/${i}`)), [0, 4])
})

test('eviction treats a read entry as the most recently used', () => {
  const store = new MemoryCacheStore({ maxCount: 4 })

  for (let i = 0; i < 4; i++) {
    writeEntry(store, `/${i}`)
  }
  hasEntry(store, '/0')
  writeEntry(store, '/4')

  deepStrictEqual([0, 1, 2, 3, 4].filter((i) => hasEntry(store, `/${i}`)), [0, 4])
})

test('eviction keeps the entry just written', () => {
  const store = new MemoryCacheStore({ maxSize: 300 })

  writeEntry(store, '/', { body: 'x'.repeat(100), vary: { accept: 'a' } })
  writeEntry(store, '/', { body: 'x'.repeat(100), vary: { accept: 'b' } })
  writeEntry(store, '/other', { body: 'x'.repeat(100) })
  writeEntry(store, '/', { body: 'x'.repeat(250), vary: { accept: 'a' } })

  equal(hasEntry(store, '/', { accept: 'a' }), true)
  equal(hasEntry(store, '/', { accept: 'b' }), false)
  equal(hasEntry(store, '/other'), false)
  equal(store.size, 250)
})

test('an expired entry is replaced rather than duplicated', async () => {
  const store = new MemoryCacheStore()

  for (let i = 0; i < 5; i++) {
    writeEntry(store, '/', { body: 'x'.repeat(100), ttl: 5 })
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  equal(store.size, 100)
})
