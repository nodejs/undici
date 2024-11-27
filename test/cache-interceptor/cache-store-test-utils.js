'use strict'

const { describe, test } = require('node:test')
const { deepStrictEqual, notEqual, equal } = require('node:assert')
const { Readable } = require('node:stream')
const { once } = require('node:events')

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheStore} CacheStore
 *
 * @param {{ new(...any): CacheStore }} CacheStore
 */
function cacheStoreTests (CacheStore) {
  describe(CacheStore.prototype.constructor.name, () => {
    test('matches interface', async () => {
      const store = new CacheStore()
      equal(typeof store.get, 'function')
      equal(typeof store.createWriteStream, 'function')
      equal(typeof store.delete, 'function')
    })

    // Checks that it can store & fetch different responses
    test('basic functionality', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }
      const requestBody = ['asd', '123']

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
       */
      const store = new CacheStore()

      // Sanity check
      equal(store.get(request), undefined)

      // Write the response to the store
      let writeStream = store.createWriteStream(request, requestValue)
      notEqual(writeStream, undefined)
      writeResponse(writeStream, requestBody)

      // Now try fetching it with a deep copy of the original request
      let readResult = store.get(structuredClone(request))
      notEqual(readResult, undefined)

      deepStrictEqual(await readResponse(readResult), {
        ...requestValue,
        etag: undefined,
        vary: undefined,
        cacheControlDirectives: {},
        body: Buffer.concat(requestBody.map(x => Buffer.from(x)))
      })

      // Now let's write another request to the store
      const anotherRequest = {
        origin: 'localhost',
        path: '/asd',
        method: 'GET',
        headers: {}
      }
      const anotherValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }
      const anotherBody = ['asd2', '1234']

      // We haven't cached this one yet, make sure it doesn't confuse it with
      //  another request
      equal(store.get(anotherRequest), undefined)

      // Now let's cache it
      writeStream = store.createWriteStream(anotherRequest, {
        ...anotherValue,
        body: []
      })
      notEqual(writeStream, undefined)
      writeResponse(writeStream, anotherBody)

      readResult = store.get(anotherRequest)
      notEqual(readResult, undefined)
      deepStrictEqual(await readResponse(readResult), {
        ...anotherValue,
        etag: undefined,
        vary: undefined,
        cacheControlDirectives: {},
        body: Buffer.concat(anotherBody.map(x => Buffer.from(x)))
      })
    })

    test('returns stale response if possible', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        cacheControlDirectives: {},
        cachedAt: Date.now() - 10000,
        staleAt: Date.now() - 1,
        deleteAt: Date.now() + 20000
      }
      const requestBody = ['part1', 'part2']

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
       */
      const store = new CacheStore()

      const writeStream = store.createWriteStream(request, requestValue)
      notEqual(writeStream, undefined)
      writeResponse(writeStream, requestBody)

      const readResult = store.get(request)
      deepStrictEqual(await readResponse(readResult), {
        ...requestValue,
        etag: undefined,
        vary: undefined,
        cacheControlDirectives: {},
        body: Buffer.concat(requestBody.map(x => Buffer.from(x)))
      })
    })

    test('doesn\'t return response past deletedAt', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {}
      }
      const requestValue = {
        statusCode: 200,
        statusMessage: '',
        cachedAt: Date.now() - 20000,
        headers: {},
        staleAt: Date.now() - 10000,
        deleteAt: Date.now() - 5
      }
      const requestBody = ['part1', 'part2']

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
       */
      const store = new CacheStore()

      const writeStream = store.createWriteStream(request, requestValue)
      notEqual(writeStream, undefined)
      writeResponse(writeStream, requestBody)

      equal(store.get(request), undefined)
    })

    test('respects vary directives', async () => {
      const request = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'hello world'
        }
      }
      const requestValue = {
        statusCode: 200,
        statusMessage: '',
        headers: { foo: 'bar' },
        vary: {
          'some-header': 'hello world'
        },
        cacheControlDirectives: {},
        cachedAt: Date.now(),
        staleAt: Date.now() + 10000,
        deleteAt: Date.now() + 20000
      }
      const requestBody = ['part1', 'part2']

      /**
       * @type {import('../../types/cache-interceptor.d.ts').default.CacheStore}
       */
      const store = new CacheStore()

      // Sanity check
      equal(store.get(request), undefined)

      const writeStream = store.createWriteStream(request, requestValue)
      notEqual(writeStream, undefined)
      writeResponse(writeStream, requestBody)

      const readStream = store.get(structuredClone(request))
      notEqual(readStream, undefined)
      const { vary, ...responseValue } = requestValue
      deepStrictEqual(await readResponse(readStream), {
        ...responseValue,
        etag: undefined,
        vary: { 'some-header': 'hello world' },
        cacheControlDirectives: {},
        body: Buffer.concat(requestBody.map(x => Buffer.from(x)))
      })

      const nonMatchingRequest = {
        origin: 'localhost',
        path: '/',
        method: 'GET',
        headers: {
          'some-header': 'another-value'
        }
      }
      equal(store.get(nonMatchingRequest), undefined)
    })
  })
}

/**
 * @param {import('node:stream').Writable} stream
 * @param {string[]} body
 */
function writeResponse (stream, body) {
  for (const chunk of body) {
    stream.write(Buffer.from(chunk))
  }

  stream.end()
  return stream
}

/**
 * @param {import('../../types/cache-interceptor.d.ts').default.GetResult} result
 * @returns {Promise<import('../../types/cache-interceptor.d.ts').default.GetResult | { body: Buffer[] }>}
 */
async function readResponse ({ body: src, ...response }) {
  notEqual(response, undefined)
  notEqual(src, undefined)

  const stream = Readable.from(src ?? [])

  /**
   * @type {Buffer[]}
   */
  const body = []
  stream.on('data', chunk => {
    body.push(Buffer.from(chunk))
  })

  await once(stream, 'end')

  return {
    ...response,
    body: Buffer.concat(body)
  }
}

module.exports = {
  cacheStoreTests,
  writeResponse,
  readResponse
}
