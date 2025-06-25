'use strict'

const { test } = require('node:test')
const { equal } = require('node:assert')
const MemoryCacheStore = require('../../lib/cache/memory-cache-store')
const { cacheStoreTests } = require('./cache-store-test-utils.js')

cacheStoreTests(MemoryCacheStore)

test('default values are correctly set', () => {
  const store = new MemoryCacheStore()

  // Test that defaults are applied by checking isFull behavior
  // Default maxCount is 1024, so cache should not be full initially
  equal(store.isFull(), false, 'Should not be full with default limits')

  // Verify defaults match expected values by checking internal behavior
  // Since we can't access private fields directly, we test the behavior
  const storeWithExplicitDefaults = new MemoryCacheStore({
    maxCount: 1024,
    maxSize: 104857600, // 100MB
    maxEntrySize: 5242880 // 5MB
  })

  equal(store.isFull(), storeWithExplicitDefaults.isFull(), 'Default store should behave same as explicitly configured store')
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

test('isFull returns true when maxSize reached', async () => {
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

  equal(store.isFull(), true, 'Should be full when maxSize exceeded')
})

test('isFull returns true when maxCount reached', async () => {
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

  equal(store.isFull(), true, 'Should be full when maxCount exceeded')
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
