'use strict'

const { equal, notEqual, deepStrictEqual } = require('node:assert')
const { describe, test, after } = require('node:test')
const { Readable } = require('node:stream')
const { once } = require('node:events')
const FakeTimers = require('@sinonjs/fake-timers')

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
