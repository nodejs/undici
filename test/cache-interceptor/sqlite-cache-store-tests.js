'use strict'

const { test, skip } = require('node:test')
const { deepStrictEqual, notEqual } = require('node:assert')
const { rm } = require('node:fs/promises')
const { cacheStoreTests, writeResponse, readResponse } = require('./cache-store-test-utils.js')

let hasSqlite = false
try {
  require('node:sqlite')

  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  cacheStoreTests(SqliteCacheStore)
  hasSqlite = true
} catch (_) {
  skip('`node:sqlite` not present')
}

test('SqliteCacheStore works nicely with multiple stores', async (t) => {
  if (!hasSqlite) {
    t.skip()
    return
  }

  const SqliteCacheStore = require('../../lib/cache/sqlite-cache-store.js')
  const sqliteLocation = 'cache-interceptor.sqlite'

  const storeA = new SqliteCacheStore({
    location: sqliteLocation
  })

  const storeB = new SqliteCacheStore({
    location: sqliteLocation
  })

  t.after(async () => {
    await rm(sqliteLocation)
  })

  const request = {
    origin: 'localhost',
    path: '/',
    method: 'GET',
    headers: {}
  }

  const requestValue = {
    statusCode: 200,
    statusMessage: '',
    rawHeaders: [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')],
    cachedAt: Date.now(),
    staleAt: Date.now() + 10000,
    deleteAt: Date.now() + 20000
  }
  const requestBody = ['asd', '123']

  const writable = storeA.createWriteStream(request, requestValue)
  notEqual(writable, undefined)
  writeResponse(writable, requestBody)

  // Make sure we got the expected response from store a
  let readable = storeA.get(request)
  notEqual(readable, undefined)
  deepStrictEqual(await readResponse(readable), {
    ...requestValue,
    etag: undefined,
    body: requestBody
  })

  // Make sure we got the expected response from store b
  readable = storeB.get(request)
  notEqual(readable, undefined)
  deepStrictEqual(await readResponse(readable), {
    ...requestValue,
    etag: undefined,
    body: requestBody
  })
})
