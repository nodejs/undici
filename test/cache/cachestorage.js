'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { kConstruct } = require('../../lib/core/symbols')
const { Cache } = require('../../lib/cache/cache')
const { CacheStorage } = require('../../lib/cache/cachestorage')
const { Request, Response } = require('../..')

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

test('CacheStorage - match', async () => {
  const caches = new CacheStorage(kConstruct)
  const v1Storage = await caches.open('v1')
  await caches.open('v2')
  await v1Storage.put('https://localhost/v1', new Response('v1'))

  assert.strictEqual(
    await (await caches.match('https://localhost/v1')).text(),
    'v1'
  )

  assert.strictEqual(
    await caches.match('https://localhost/v2', { cacheName: 'v1' }),
    undefined
  )

  assert.strictEqual(
    await caches.match('https://localhost/v1', { cacheName: 'v2' }),
    undefined
  )
})

test('CacheStorage - has', async () => {
  const caches = new CacheStorage(kConstruct)
  await caches.open('v1')
  assert(await caches.has('v1'))
  assert(!(await caches.has('v2')))
})

test('CacheStorage - open', async () => {
  const caches = new CacheStorage(kConstruct)
  await assert.doesNotReject(() => caches.open('test'))
  assert.notStrictEqual(await caches.open('v1'), await caches.open('v1'))
})

test('CacheStorage - delete', async () => {
  const caches = new CacheStorage(kConstruct)

  await caches.open('v1')
  assert(await caches.has('v1'))

  await caches.delete('v1')
  assert(!(await caches.has('v1')))
})

test('CacheStorage - keys', async () => {
  const caches = new CacheStorage(kConstruct)

  assert.deepStrictEqual(await caches.keys(), [])

  await caches.open('v1')
  assert.deepStrictEqual(await caches.keys(), ['v1'])

  await caches.open('v2')
  assert.deepStrictEqual(await caches.keys(), ['v1', 'v2'])

  // await caches.delete('v1')
  // assert.deepStrictEqual(await caches.keys(), ['v2'])
})

test('Cache - match', async () => {
  const caches = new CacheStorage(kConstruct)
  const storage = await caches.open('test')
  await storage.put('https://localhost/v1', new Response('Hi'))
  assert.strictEqual(
    await (await storage.match('https://localhost/v1')).text(),
    'Hi'
  )
  assert.strictEqual(await storage.match('https://localhost/v2'), undefined)
})

test('Cache - put', async (t) => {
  const caches = new CacheStorage(kConstruct)
  const storage = await caches.open('test')
  // put(RequestInfo, Response)
  await storage.put('https://localhost/v1', new Response('v1'))
  // put(Request, Response)
  await storage.put(new Request('https://localhost/v2'), new Response('v2'))

  await t.test('Scheme of the url is not http or https.', async () => {
    await assert.rejects(
      () => storage.put('blob://localhost', new Response('blob://')),
      TypeError
    )
  })

  await t.test('method is not GET.', async () => {
    await assert.rejects(
      () =>
        storage.put(
          new Request('https://localhost/post', {
            method: 'POST'
          }),
          new Response('POST')
        ),
      TypeError
    )
  })

  await t.test('HTTP status is 206.', async () => {
    await assert.rejects(
      () =>
        storage.put(
          'https://localhost/206',
          new Response('206 Partial Content', {
            status: 206
          })
        ),
      TypeError
    )
  })

  // TODO
})

test('Cache - keys', async () => {
  const caches = new CacheStorage(kConstruct)
  const storage = await caches.open('test')
  // keys()
  assert.deepStrictEqual(await storage.keys(), [])

  // TODO

  // await storage.put('https://localhost/v1', new Response('v1'))

  // TODO

  // keys(RequestInfo, CacheQueryOptions)
})
