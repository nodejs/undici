'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { kConstruct } = require('../../lib/core/symbols')
const { Cache } = require('../../lib/cache/cache')
const { CacheStorage } = require('../../lib/cache/cachestorage')

describe('create instance', () => {
  test('illegal constructor', () => {
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new Cache()
    }, TypeError)
    assert.throws(() => {
      // eslint-disable-next-line no-new
      new CacheStorage()
    }, TypeError)
  })

  test('create instance of CacheStorage', () => {
    assert.doesNotThrow(() => new CacheStorage(kConstruct))
  })

  test('create instance of Cache', () => {
    assert.doesNotThrow(() => new Cache(kConstruct, []))
  })

  test('CacheStorage - toStringTag', () => {
    // toStringTag
    assert.strictEqual(
      new CacheStorage(kConstruct)[Symbol.toStringTag],
      'CacheStorage'
    )
    assert.doesNotThrow(() => {
      CacheStorage.prototype[Symbol.toStringTag].charAt(0)
    })
  })

  test('Cache - toStringTag', () => {
    // toStringTag
    assert.strictEqual(new Cache(kConstruct, [])[Symbol.toStringTag], 'Cache')
    assert.doesNotThrow(() => {
      Cache.prototype[Symbol.toStringTag].charAt(0)
    })
  })
})

describe('CacheStorage - brand in check', () => {
  ['match', 'has', 'open', 'delete', 'keys'].forEach((key) => {
    test(`CacheStorage - brand in check "${key}"`, async () => {
      await assert.rejects(
        () => CacheStorage.prototype[key].call(null),
        TypeError
      )
    })
  })
})

describe('Cache - brand in check', () => {
  ['match', 'matchAll', 'add', 'addAll', 'put', 'delete', 'keys'].forEach(
    (key) => {
      test(`Cache - brand in check "${key}"`, async () => {
        await assert.rejects(() => Cache.prototype[key].call(null), TypeError)
      })
    }
  )
})

test('open CacheStorage', async () => {
  const caches = new CacheStorage(kConstruct)
  await assert.doesNotReject(() => caches.open('test'))
})
