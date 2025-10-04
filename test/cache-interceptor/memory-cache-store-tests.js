'use strict'

const { test } = require('node:test')
const MemoryCacheStore = require('../../lib/cache/memory-cache-store')
const { cacheStoreTests } = require('./cache-store-test-utils.js')

cacheStoreTests(MemoryCacheStore)

test('default limits prevent memory leaks', async (t) => {
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

  // Should be full after exceeding maxCount default of 1024
  t.assert.strictEqual(store.isFull(), true, 'Store should be full after exceeding maxCount default')
})

test('default maxEntrySize prevents large entries', async (t) => {
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
  t.assert.strictEqual(result, undefined, 'Large entry should not be cached due to maxEntrySize limit')
})

test('size getter returns correct total size', async (t) => {
  const store = new MemoryCacheStore()
  const testData = 'test data'

  t.assert.strictEqual(store.size, 0, 'Initial size should be 0')

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

  t.assert.strictEqual(store.size, testData.length, 'Size should match written data length')
})

test('isFull returns false when under limits', (t) => {
  const store = new MemoryCacheStore({
    maxSize: 1000,
    maxCount: 10
  })

  t.assert.strictEqual(store.isFull(), false, 'Should not be full when empty')
})

test('isFull returns true when maxSize reached', async (t) => {
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

  t.assert.strictEqual(store.isFull(), true, 'Should be full when maxSize exceeded')
})

test('isFull returns true when maxCount reached', async (t) => {
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

  t.assert.strictEqual(store.isFull(), true, 'Should be full when maxCount exceeded')
})

test('emits maxSizeExceeded event when limits exceeded', async (t) => {
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

  t.assert.strictEqual(eventFired, true, 'maxSizeExceeded event should fire')
  t.assert.strictEqual(typeof eventPayload, 'object', 'Event should have payload')
  t.assert.strictEqual(typeof eventPayload.size, 'number', 'Payload should have size')
  t.assert.strictEqual(typeof eventPayload.maxSize, 'number', 'Payload should have maxSize')
  t.assert.strictEqual(typeof eventPayload.count, 'number', 'Payload should have count')
  t.assert.strictEqual(typeof eventPayload.maxCount, 'number', 'Payload should have maxCount')
})
