const { describe, test } = require('node:test')
const { deepStrictEqual, strictEqual } = require('node:assert')
const MemoryCacheStore = require('../../lib/cache/memory-cache-store')

/**
 * @param {typeof import('../../types/cache-interceptor').default.CacheStore} CacheStore
 */
function cacheStoreTests (CacheStore) {
  describe(CacheStore.prototype.constructor.name, () => {
    test('basic functionality', async () => {
      // Checks that it can store & fetch different responses
      const store = new CacheStore()

      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        complete: true,
        statusCode: 200,
        statusMessage: '',
        rawHeaders: [1, 2, 3],
        rawTrailers: [4, 5, 6],
        body: ['part1', 'part2'],
        size: 16,
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }

      // Sanity check
      strictEqual(await store.get(request), undefined)

      // Add a response to the cache and try fetching it with a deep copy of
      //  the original request
      await store.put(request, requestValue)
      deepStrictEqual(store.get(structuredClone(request)), requestValue)

      const anotherRequest = {
        origin: 'localhost',
        path: '/asd',
        method: 'GET',
        headers: {}
      }
      const anotherValue = {
        complete: true,
        statusCode: 200,
        statusMessage: '',
        rawHeaders: [1, 2, 3],
        rawTrailers: [4, 5, 6],
        body: ['part1', 'part2'],
        size: 16,
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }

      // We haven't cached this one yet, make sure it doesn't confuse it with
      //  another request
      strictEqual(await store.get(anotherRequest), undefined)

      // Add a response to the cache and try fetching it with a deep copy of
      //  the original request
      await store.put(anotherRequest, anotherValue)
      deepStrictEqual(store.get(structuredClone(anotherRequest)), anotherValue)
    })

    test('returns stale response if possible', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        complete: true,
        statusCode: 200,
        statusMessage: '',
        rawHeaders: [1, 2, 3],
        rawTrailers: [4, 5, 6],
        body: ['part1', 'part2'],
        size: 16,
        cachedAt: Date.now() - 10000,
        staleAt: Date.now() - 1,
        deleteAt: Date.now() + 20000
      }

      const store = new CacheStore()
      await store.put(request, requestValue)
      deepStrictEqual(await store.get(request), requestValue)
    })

    test('doesn\'t return response past deletedAt', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        complete: true,
        statusCode: 200,
        statusMessage: '',
        rawHeaders: [1, 2, 3],
        rawTrailers: [4, 5, 6],
        body: ['part1', 'part2'],
        size: 16,
        cachedAt: Date.now() - 20000,
        staleAt: Date.now() - 10000,
        deleteAt: Date.now() - 5
      }

      const store = new CacheStore()
      await store.put(request, requestValue)
      strictEqual(await store.get(request), undefined)
    })

    test('respects vary directives', async () => {
      const store = new CacheStore()

      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'hello world'
        }
      }
      const requestValue = {
        complete: true,
        statusCode: 200,
        statusMessage: '',
        rawHeaders: [1, 2, 3],
        rawTrailers: [4, 5, 6],
        body: ['part1', 'part2'],
        vary: {
          'some-header': 'hello world'
        },
        size: 16,
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }

      // Sanity check
      strictEqual(await store.get(request), undefined)

      await store.put(request, requestValue)
      deepStrictEqual(store.get(request), requestValue)

      const nonMatchingRequest = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'another-value'
        }
      }
      deepStrictEqual(store.get(nonMatchingRequest), undefined)

      deepStrictEqual(store.get(structuredClone(request)), requestValue)
    })
  })
}

cacheStoreTests(MemoryCacheStore)
