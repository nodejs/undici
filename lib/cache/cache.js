'use strict'

const { kConstruct } = require('./symbols')
const { urlEquals } = require('./util')
const { kEnumerableProperty } = require('../core/util')
const { webidl } = require('../fetch/webidl')
const { Response } = require('../fetch/response')
const { Request } = require('../fetch/request')
const { kState } = require('../fetch/symbols')
const { urlIsHttpHttpsScheme, createDeferredPromise } = require('../fetch/util')
const assert = require('assert')

/**
 * @see https://w3c.github.io/ServiceWorker/#dfn-cache-batch-operation
 * @typedef {Object} CacheBatchOperation
 * @property {'delete' | 'put'} type
 * @property {any} request
 * @property {any} response
 * @property {import('../../types/cache').CacheQueryOptions} options
 */

/**
 * @see https://w3c.github.io/ServiceWorker/#dfn-request-response-list
 * @typedef {[any, any][]} requestResponseList
 */

class Cache {
  /**
   * The name of the cache
   * @type {string}
   */
  #id

  /**
   * @see https://w3c.github.io/ServiceWorker/#dfn-relevant-request-response-list
   * @type {requestResponseList}
   */
  #relevantRequestResponseList = []

  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }

    this.#id = arguments[1]
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.match' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async matchAll (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    if (request !== undefined) request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async add (request) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.add' })

    request = webidl.converters.RequestInfo(request)
  }

  async addAll (requests) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.addAll' })

    requests = webidl.converters['sequence<RequestInfo>'](requests)
  }

  async put (request, response) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 2, { header: 'Cache.put' })

    request = webidl.converters.RequestInfo(request)
    response = webidl.converters.Response(response)
  }

  delete (request, options = {}) {
    webidl.brandCheck(this, Cache)
    webidl.argumentLengthCheck(arguments, 1, { header: 'Cache.delete' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)

    /**
     * @type {Request}
     */
    let r = null

    if (request instanceof Request) {
      r = request[kState]

      if (r.method !== 'GET' && !options.ignoreMethod) {
        return false
      }
    } else {
      assert(typeof request === 'string')

      r = new Request(r)
    }

    /** @type {CacheBatchOperation[]} */
    const operations = []

    /** @type {CacheBatchOperation} */
    const operation = {
      type: 'delete',
      request: r,
      options
    }

    operations.push(operation)

    const cacheJobPromise = createDeferredPromise()

    let errorData = null
    let requestResponses

    try {
      requestResponses = this.#batchCacheOperations(operations)
    } catch (e) {
      errorData = e
    }

    queueMicrotask(() => {
      if (errorData === null) {
        cacheJobPromise.resolve(requestResponses?.length)
      } else {
        cacheJobPromise.reject(errorData)
      }
    })

    return cacheJobPromise.promise
  }

  async keys (request = undefined, options = {}) {
    webidl.brandCheck(this, Cache)

    if (request !== undefined) request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#batch-cache-operations
   * @param {CacheBatchOperation[]} operations
   * @returns {requestResponseList}
   */
  #batchCacheOperations (operations) {
    const cache = this.#relevantRequestResponseList

    const backupCache = structuredClone(cache)

    const addedItems = []

    const resultList = []

    try {
      for (const operation of operations) {
        if (operation.type !== 'delete' && operation.type !== 'put') {
          throw webidl.errors.exception({
            header: 'Cache.#batchCacheOperations',
            message: 'operation type does not match "delete" or "put"'
          })
        }

        if (operation.type === 'delete' && operation.response != null) {
          throw webidl.errors.exception({
            header: 'Cache.#batchCacheOperations',
            message: 'delete operation should not have an associated response'
          })
        }

        if (this.#queryCache(operation.request, operation.options, addedItems).length) {
          throw new DOMException('???', 'InvalidStateError')
        }

        let requestResponses

        if (operation.type === 'delete') {
          requestResponses = this.#queryCache(operation.request, operation.options)

          for (const requestResponse of requestResponses) {
            const idx = cache.indexOf(requestResponse)
            assert(idx !== -1)

            cache.splice(idx, 1)
          }
        } else if (operation.type === 'put') {
          if (operation.response == null) {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'put operation should have an associated response'
            })
          }

          const r = operation.request

          if (!urlIsHttpHttpsScheme(r.url)) {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'expected http or https scheme'
            })
          }

          if (r.method !== 'GET') {
            throw webidl.errors.exception({
              header: 'Cache.#batchCacheOperations',
              message: 'not get method'
            })
          }

          requestResponses = this.#queryCache(operation.request)

          for (const requestResponse of requestResponses) {
            const idx = cache.indexOf(requestResponse)
            assert(idx !== -1)

            cache.splice(idx, 1)
          }

          cache.push([operation.request, operation.response])

          addedItems.push([operation.request, operation.response])
        }

        resultList.push([operation.request, operation.response])
      }

      return resultList
    } catch (e) {
      this.#relevantRequestResponseList.length = 0

      this.#relevantRequestResponseList = backupCache

      throw e
    }
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#query-cache
   * @param {any} requestQuery
   * @param {import('../../types/cache').CacheQueryOptions} options
   * @param {requestResponseList} targetStorage
   * @returns {requestResponseList}
   */
  #queryCache (requestQuery, options, targetStorage) {
    /** @type {requestResponseList} */
    const resultList = []

    const storage = targetStorage ?? this.#relevantRequestResponseList

    for (const [cachedRequest, cachedResponse] of storage) {
      if (this.#requestMatchesCachedItem(requestQuery, cachedRequest, cachedResponse, options)) {
        resultList.push([cachedRequest, cachedResponse])
      }
    }

    return resultList
  }

  /**
   * @see https://w3c.github.io/ServiceWorker/#request-matches-cached-item-algorithm
   * @param {any} requestQuery
   * @param {any} request
   * @param {any | null} response
   * @param {import('../../types/cache').CacheQueryOptions | undefined} options
   * @returns {boolean}
   */
  #requestMatchesCachedItem (requestQuery, request, response = null, options) {
    if (options?.ignoreMethod === false && request.method === 'GET') {
      return false
    }

    /** @type {URL} */
    const queryURL = requestQuery.url

    /** @type {URL} */
    const cachedURL = request.url

    if (options?.ignoreSearch) {
      cachedURL.hash = ''

      queryURL.hash = ''
    }

    if (!urlEquals(queryURL, cachedURL, true)) {
      return false
    }

    if (
      response == null ||
      options?.ignoreVary ||
      !response.headersList.contains('vary')
    ) {
      return true
    }

    // https://github.com/chromium/chromium/blob/694d20d134cb553d8d89e5500b9148012b1ba299/content/browser/cache_storage/cache_storage_cache.cc#L260-L262
    const fieldValues = response.headersList.get('vary').split(',').map(h => h.trim()).filter(h => h.length)

    // TODO: wtf is the spec saying?
    for (const fieldValue of fieldValues) {
      if (fieldValue === '*') {
        return false
      }
    }

    const requestVary = request.headersList.get('vary')
    const queryVary = requestQuery.headersList.get('vary')

    if (requestVary !== queryVary) {
      return false
    }

    return true
  }
}

Object.defineProperties(Cache.prototype, {
  [Symbol.toStringTag]: {
    value: 'Cache',
    configurable: true
  },
  match: kEnumerableProperty,
  matchAll: kEnumerableProperty,
  add: kEnumerableProperty,
  addAll: kEnumerableProperty,
  put: kEnumerableProperty,
  delete: kEnumerableProperty,
  keys: kEnumerableProperty
})

webidl.converters.CacheQueryOptions = webidl.dictionaryConverter([
  {
    key: 'ignoreSearch',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreMethod',
    converter: webidl.converters.boolean,
    defaultValue: false
  },
  {
    key: 'ignoreVary',
    converter: webidl.converters.boolean,
    defaultValue: false
  }
])

webidl.converters.Response = webidl.interfaceConverter(Response)

webidl.converters['sequence<RequestInfo>'] = webidl.sequenceConverter(
  webidl.converters.RequestInfo
)

module.exports = {
  Cache
}
