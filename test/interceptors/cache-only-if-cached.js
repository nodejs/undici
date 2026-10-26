'use strict'

const { test } = require('node:test')
const { strictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Readable } = require('node:stream')
const { Client, interceptors, cacheStores: { MemoryCacheStore } } = require('../../index')

for (const { name, responseCacheControl, requestCacheControl = '', elapsed = 0, statusCode = 504, withRequestBody = false } of [
  { name: 'fresh response', responseCacheControl: 'max-age=60', statusCode: 200 },
  { name: 'stale response', responseCacheControl: 'max-age=10', elapsed: 15000 },
  { name: 'response no-cache', responseCacheControl: 'max-age=60, no-cache' },
  { name: 'request no-cache', responseCacheControl: 'max-age=60', requestCacheControl: ', no-cache' },
  { name: 'request max-age', responseCacheControl: 'max-age=60', requestCacheControl: ', max-age=0' },
  { name: 'request min-fresh', responseCacheControl: 'max-age=30', requestCacheControl: ', min-fresh=60' },
  { name: 'stale-if-error', responseCacheControl: 'max-age=10, stale-if-error=60', elapsed: 15000 },
  { name: 'max-stale', responseCacheControl: 'max-age=10', requestCacheControl: ', max-stale=10', elapsed: 15000, statusCode: 200 },
  { name: 'must-revalidate overrides max-stale', responseCacheControl: 'max-age=10, must-revalidate', requestCacheControl: ', max-stale=10', elapsed: 15000 },
  { name: 'stale-while-revalidate', responseCacheControl: 'max-age=10, stale-while-revalidate=60', elapsed: 15000, statusCode: 200 },
  { name: 's-maxage overrides stale-while-revalidate', responseCacheControl: 's-maxage=10, stale-while-revalidate=60', elapsed: 15000 },
  { name: 'min-fresh overrides stale-while-revalidate', responseCacheControl: 'max-age=10, stale-while-revalidate=60', requestCacheControl: ', min-fresh=60', elapsed: 15000 },
  { name: 'no-cache overrides stale-while-revalidate', responseCacheControl: 'max-age=10, stale-while-revalidate=60', requestCacheControl: ', no-cache', elapsed: 15000 },
  { name: 'no-store can reuse an existing response', responseCacheControl: 'max-age=60', requestCacheControl: ', no-store', statusCode: 200 },
  { name: 'unused request body on a 504', responseCacheControl: 'max-age=10', elapsed: 15000, withRequestBody: true },
  { name: 'unused request body on a stale response', responseCacheControl: 'max-age=10, stale-while-revalidate=60', elapsed: 15000, withRequestBody: true, statusCode: 200 }
]) {
  test(`only-if-cached does not contact the origin: ${name}`, async t => {
    let now = Date.UTC(2026, 0, 1)
    t.mock.method(Date, 'now', () => now)

    let requestsToOrigin = 0
    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('date', new Date(now).toUTCString())
      res.setHeader('cache-control', responseCacheControl)
      res.setHeader('etag', '"cached"')
      if (req.headers['if-none-match']) {
        res.statusCode = 304
      }
      res.end('cached response')
    }).listen(0)
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())
    t.after(async () => {
      await client.destroy()
      await new Promise(resolve => server.close(resolve))
    })

    const request = { path: '/', method: 'GET' }
    strictEqual(await (await client.request(request)).body.text(), 'cached response')
    strictEqual(requestsToOrigin, 1)
    now += elapsed

    const requestBody = withRequestBody ? Readable.from(['request body']) : undefined
    const response = await client.request({
      ...request,
      body: requestBody,
      headers: { 'cache-control': `only-if-cached${requestCacheControl}` }
    })
    const body = await response.body.text()
    // Closing waits for any background revalidation to finish as well.
    await client.close()

    strictEqual(requestsToOrigin, 1)
    strictEqual(response.statusCode, statusCode)
    strictEqual(body, statusCode === 200 ? 'cached response' : '')
    if (requestBody) {
      strictEqual(requestBody.destroyed, true)
    }
  })
}

for (const expired of [false, true]) {
  test(`only-if-cached releases ${expired ? 'an expired' : 'a stale'} body from an async store`, async t => {
    const now = Date.now()
    const body = new Readable({ read () {} })
    const store = {
      async get () {
        return {
          statusCode: 200,
          statusMessage: 'OK',
          headers: {},
          cacheControlDirectives: {},
          cachedAt: now - 20000,
          staleAt: now - 10000,
          deleteAt: expired ? now - 1 : now + 60000,
          body
        }
      },
      createWriteStream () {},
      delete () {}
    }
    const client = new Client('http://localhost:1').compose(interceptors.cache({ store }))
    t.after(() => client.destroy())

    const response = await client.request({
      path: '/',
      method: 'GET',
      headers: { 'cache-control': 'only-if-cached' }
    })

    strictEqual(response.statusCode, 504)
    strictEqual(await response.body.text(), '')
    strictEqual(body.destroyed, true)
  })
}

test('only-if-cached with no-store returns 504 on a cache miss', async t => {
  const store = new MemoryCacheStore()
  const client = new Client('http://localhost:1').compose(interceptors.cache({ store }))
  t.after(() => client.destroy())

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: { 'cache-control': 'only-if-cached, no-store' }
  })

  strictEqual(response.statusCode, 504)
  strictEqual(await response.body.text(), '')
})
