const { describe, test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const MemoryCacheStore = require('../lib/cache/memory-cache-store.js')
const { request, Agent, setGlobalDispatcher } = require('..')
const { interceptors } = require('..')

describe('Cache with Vary headers', () => {
  async function runCacheTest (store) {
    let requestCount = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestCount++
      res.setHeader('Vary', 'Accept-Encoding')
      res.setHeader('Cache-Control', 'max-age=60')
      res.end(`Request count: ${requestCount}`)
    })

    await new Promise(resolve => server.listen(0, resolve))
    const port = server.address().port
    const url = `http://localhost:${port}`

    const agent = new Agent()
    setGlobalDispatcher(
      agent.compose(
        interceptors.cache({
          store,
          cacheByDefault: 1000,
          methods: ['GET']
        })
      )
    )

    const res1 = await request(url)
    const body1 = await res1.body.text()
    assert.strictEqual(body1, 'Request count: 1')
    assert.strictEqual(requestCount, 1)

    const res2 = await request(url)
    const body2 = await res2.body.text()
    assert.strictEqual(body2, 'Request count: 1')
    assert.strictEqual(requestCount, 1)

    const res3 = await request(url, {
      headers: {
        'Accept-Encoding': 'gzip'
      }
    })
    const body3 = await res3.body.text()
    assert.strictEqual(body3, 'Request count: 2')
    assert.strictEqual(requestCount, 2)

    await new Promise(resolve => server.close(resolve))
  }

  test('should cache response with MemoryCacheStore when Vary header exists but request header is missing', async () => {
    await runCacheTest(new MemoryCacheStore())
  })

  test('should cache response with SqliteCacheStore when Vary header exists but request header is missing', { skip: process.versions.node < '22' }, async () => {
    const SqliteCacheStore = require('../lib/cache/sqlite-cache-store.js')
    const sqliteStore = new SqliteCacheStore()
    await runCacheTest(sqliteStore)
    after(() => sqliteStore.close())
  })
})
