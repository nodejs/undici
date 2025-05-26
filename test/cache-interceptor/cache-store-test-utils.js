'use strict'

const { equal, notEqual, deepStrictEqual } = require('node:assert')
const { describe, test, after } = require('node:test')
const { Readable } = require('node:stream')
const { once } = require('node:events')
const FakeTimers = require('@sinonjs/fake-timers')
const { interceptors } = require('../../')
const { request, Agent, setGlobalDispatcher } = require('../../')
const http = require('node:http')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 *
 * @param {{ new(...any): CacheStore }} CacheStore
 */
function cacheStoreTests (CacheStore) {
  describe(CacheStore.prototype.constructor.name, () => {
    test('matches interface', () => {
      equal(typeof CacheStore.prototype.get, 'function')
      equal(typeof CacheStore.prototype.createWriteStream, 'function')
      equal(typeof CacheStore.prototype.delete, 'function')
    })

    test('caches request', async () => {
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
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }

      const body = [Buffer.from('asd'), Buffer.from('123')]

      const store = new CacheStore()

      // Sanity check
      equal(await store.get(key), undefined)

      // Write response to store
      {
        const writable = store.createWriteStream(key, value)
        notEqual(writable, undefined)
        writeBody(writable, body)
      }

      // Now let's try fetching the response from the store
      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value, body)
      }

      /**
       * Let's try out a request to a different resource to make sure it can
       *  differentiate between the two
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
       */
      const anotherKey = {
        origin: 'localhost',
        path: '/asd',
        method: 'GET',
        headers: {}
      }

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const anotherValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }

      const anotherBody = [Buffer.from('asd'), Buffer.from('123')]

      equal(store.get(anotherKey), undefined)

      {
        const writable = store.createWriteStream(anotherKey, anotherValue)
        notEqual(writable, undefined)
        writeBody(writable, anotherBody)
      }

      {
        const result = await store.get(structuredClone(anotherKey))
        notEqual(result, undefined)
        await compareGetResults(result, anotherValue, anotherBody)
      }
    })

    test('returns stale response before deleteAt', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      after(() => clock.uninstall())

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
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        // deleteAt is different because stale-while-revalidate, stale-if-error, ...
        deleteAt: Date.now() + 5000
      }

      const body = [Buffer.from('asd'), Buffer.from('123')]

      const store = new CacheStore()

      // Sanity check
      equal(store.get(key), undefined)

      {
        const writable = store.createWriteStream(key, value)
        notEqual(writable, undefined)
        writeBody(writable, body)
      }

      clock.tick(1500)

      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value, body)
      }

      clock.tick(6000)

      // Past deleteAt, shouldn't be returned
      equal(await store.get(key), undefined)
    })

    test('a stale request is overwritten', async () => {
      const clock = FakeTimers.install({
        shouldClearNativeTimers: true
      })

      after(() => clock.uninstall())

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
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        // deleteAt is different because stale-while-revalidate, stale-if-error, ...
        deleteAt: Date.now() + 5000
      }

      const body = [Buffer.from('asd'), Buffer.from('123')]

      const store = new CacheStore()

      // Sanity check
      equal(store.get(key), undefined)

      {
        const writable = store.createWriteStream(key, value)
        notEqual(writable, undefined)
        writeBody(writable, body)
      }

      clock.tick(1500)

      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value, body)
      }

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const value2 = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'baz' },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        // deleteAt is different because stale-while-revalidate, stale-if-error, ...
        deleteAt: Date.now() + 5000
      }

      const body2 = [Buffer.from('foo'), Buffer.from('123')]

      {
        const writable = store.createWriteStream(key, value2)
        notEqual(writable, undefined)
        writeBody(writable, body2)
      }

      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value2, body2)
      }
    })

    test('vary directives used to decide which response to use', async () => {
      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
       */
      const key = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'hello world'
        }
      }

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const value = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        vary: {
          'some-header': 'hello world'
        },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        deleteAt: Date.now() + 1000
      }

      const body = [Buffer.from('asd'), Buffer.from('123')]

      const store = new CacheStore()

      // Sanity check
      equal(store.get(key), undefined)

      {
        const writable = store.createWriteStream(key, value)
        notEqual(writable, undefined)
        writeBody(writable, body)
      }

      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value, body)
      }

      /**
       * Let's make another key to the same resource but with a different vary
       *  header
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
       */
      const anotherKey = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'hello world2'
        }
      }

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
       */
      const anotherValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        vary: {
          'some-header': 'hello world2'
        },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 1000,
        deleteAt: Date.now() + 1000
      }

      const anotherBody = [Buffer.from('asd'), Buffer.from('123')]

      equal(await store.get(anotherKey), undefined)

      {
        const writable = store.createWriteStream(anotherKey, anotherValue)
        notEqual(writable, undefined)
        writeBody(writable, anotherBody)
      }

      {
        const result = await store.get(structuredClone(key))
        notEqual(result, undefined)
        await compareGetResults(result, value, body)
      }

      {
        const result = await store.get(structuredClone(anotherKey))
        notEqual(result, undefined)
        await compareGetResults(result, anotherValue, anotherBody)
      }
    })

    // test('different query parameters create separate cache entries', async () => {
    //   /**
    //    * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
    //    */
    //   const baseKey = {
    //     origin: 'localhost',
    //     path: '/api/users',
    //     method: 'GET',
    //     headers: {}
    //   }

    //   /**
    //    * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
    //    */
    //   const value1 = {
    //     statusCode: 200,
    //     statusMessage: '',
    //     headers: { 'content-type': 'application/json' },
    //     cacheControlDirectives: {},
    //     cachedAt: Date.now(),
    //     staleAt: Date.now() + 10000,
    //     deleteAt: Date.now() + 20000
    //   }

    //   /**
    //    * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
    //    */
    //   const value2 = {
    //     statusCode: 200,
    //     statusMessage: '',
    //     headers: { 'content-type': 'application/json' },
    //     cacheControlDirectives: {},
    //     cachedAt: Date.now(),
    //     staleAt: Date.now() + 10000,
    //     deleteAt: Date.now() + 20000
    //   }

    //   const body1 = [Buffer.from('page1data')]
    //   const body2 = [Buffer.from('page2data')]

    //   const store = new CacheStore()

    //   // Cache response for page=1
    //   const key1 = { ...baseKey, query: { page: 1 } }
    //   {
    //     const writable = store.createWriteStream(key1, value1)
    //     notEqual(writable, undefined)
    //     writeBody(writable, body1)
    //   }

    //   // Cache response for page=2
    //   const key2 = { ...baseKey, query: { page: 2 } }
    //   {
    //     const writable = store.createWriteStream(key2, value2)
    //     notEqual(writable, undefined)
    //     writeBody(writable, body2)
    //   }

    //   // Verify we get different responses for different query parameters
    //   {
    //     const result1 = await store.get(structuredClone(key1))
    //     notEqual(result1, undefined)
    //     await compareGetResults(result1, value1, body1)
    //   }

    //   {
    //     const result2 = await store.get(structuredClone(key2))
    //     notEqual(result2, undefined)
    //     await compareGetResults(result2, value2, body2)
    //   }

    //   // Verify the responses are actually different
    //   const result1Body = await readBody(await store.get(key1))
    //   const result2Body = await readBody(await store.get(key2))

    //   notEqual(
    //     joinBufferArray(result1Body).toString(),
    //     joinBufferArray(result2Body).toString(),
    //     'Different query parameters should return different cached responses'
    //   )
    // })

    // test('complex query parameters are handled correctly', async () => {
    //   /**
    //    * @type {import('../../types/cache-interceptor.d.ts').default.CacheKey}
    //    */
    //   const baseKey = {
    //     origin: 'localhost',
    //     path: '/api/search',
    //     method: 'GET',
    //     headers: {}
    //   }

    //   /**
    //    * @type {import('../../types/cache-interceptor.d.ts').default.CacheValue}
    //    */
    //   const value = {
    //     statusCode: 200,
    //     statusMessage: '',
    //     headers: { 'content-type': 'application/json' },
    //     cacheControlDirectives: {},
    //     cachedAt: Date.now(),
    //     staleAt: Date.now() + 10000,
    //     deleteAt: Date.now() + 20000
    //   }

    //   const body = [Buffer.from('search results')]
    //   const store = new CacheStore()

    //   // Test with complex query parameters including arrays and special characters
    //   const complexKey = {
    //     ...baseKey,
    //     query: {
    //       q: 'hello world',
    //       tags: ['javascript', 'nodejs'],
    //       limit: 10,
    //       include_meta: true,
    //       'special-chars': 'test@example.com'
    //     }
    //   }

    //   // Cache the response
    //   {
    //     const writable = store.createWriteStream(complexKey, value)
    //     notEqual(writable, undefined)
    //     writeBody(writable, body)
    //   }

    //   // Verify we can retrieve it with the same complex query
    //   {
    //     const result = await store.get(structuredClone(complexKey))
    //     notEqual(result, undefined)
    //     await compareGetResults(result, value, body)
    //   }

    //   // Verify that a slightly different query doesn't match
    //   const differentKey = {
    //     ...baseKey,
    //     query: {
    //       q: 'hello world',
    //       tags: ['javascript', 'nodejs'],
    //       limit: 20, // Different limit
    //       include_meta: true,
    //       'special-chars': 'test@example.com'
    //     }
    //   }

    //   equal(await store.get(differentKey), undefined, 'Different query parameters should not match existing cache entry')
    // })

    test('playground', async () => {
      // Interceptors to add response caching, DNS caching and retrying to the dispatcher
      const { cache, dns, retry } = interceptors

      const defaultDispatcher = new Agent({
        connections: 100, // Limit concurrent kept-alive connections to not run out of resources
        headersTimeout: 10_000, // 10 seconds; set as appropriate for the remote servers you plan to connect to
        bodyTimeout: 10_000
      }).compose(cache(), dns(), retry())

      setGlobalDispatcher(defaultDispatcher) // Add these interceptors to all `fetch` and Undici `request` calls

      const server = new http.Server((req, res) => {
        sleep(100).then(() => {
          res
            .writeHead(200, {
              'Content-Type': 'application/json',
              'Cache-Control': '"public, max-age=100, stale-while-revalidate=100"'
            })
            .end(new Date().toISOString())
        })
      })
      server.listen('8080')

      const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t))

      const responses = new Set()
      for (let i = 0; i <= 10; i++) {
        const startedAt = performance.now()
        const query = { i }
        const res = await request({
          origin: 'http://localhost:8080',

          // path works fine
          // path: `?i=${i}`,

          // while same via `query` fails?
          query,
          headers: {
            'Content-Tupe': 'application/json',
            UserAgent: 'UndiciExample/1.0.0'
          }
        })
        const text = await res.body.text()
        responses.add(text)
        console.log({
          url: `/?i=${i}`,
          duration: (performance.now() - startedAt) / 1000,
          response: text
        })
      }

      console.log('Unique responses', responses.size, responses)
    })
  })
}

/**
 * @param {import('node:stream').Writable} stream
 * @param {Buffer[]} body
 */
function writeBody (stream, body) {
  for (const chunk of body) {
    stream.write(chunk)
  }

  stream.end()
  return stream
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} param0
 * @returns {Promise<Buffer[] | undefined>}
 */
async function readBody ({ body }) {
  if (!body) {
    return undefined
  }

  if (typeof body === 'string') {
    return [Buffer.from(body)]
  }

  if (body.constructor.name === 'Buffer') {
    return [body]
  }

  const stream = Readable.from(body)

  /**
   * @type {Buffer[]}
   */
  const streamedBody = []

  stream.on('data', chunk => {
    streamedBody.push(Buffer.from(chunk))
  })

  await once(stream, 'end')

  return streamedBody
}

/**
 * @param {Buffer[]} buffers
 * @returns {Buffer}
 */
function joinBufferArray (buffers) {
  const data = []

  for (const buffer of buffers) {
    buffer.forEach((chunk) => {
      data.push(chunk)
    })
  }

  return Buffer.from(data)
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} actual
 * @param {import('../../types/cache-interceptor.d.ts').default.CacheValue} expected
 * @param {Buffer[]} expectedBody
*/
async function compareGetResults (actual, expected, expectedBody) {
  const actualBody = await readBody(actual)
  deepStrictEqual(
    actualBody ? joinBufferArray(actualBody) : undefined,
    joinBufferArray(expectedBody)
  )

  for (const key of Object.keys(expected)) {
    deepStrictEqual(actual[key], expected[key])
  }
}

module.exports = {
  cacheStoreTests,
  writeBody,
  readBody,
  compareGetResults
}
