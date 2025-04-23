const { describe, test, after } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const MemoryCacheStore = require('../lib/cache/memory-cache-store.js')
const { Agent, interceptors, request, setGlobalDispatcher } = require('..')

describe('Cache with cache-control: no-store request header', () => {
  test('should revalidate reponses with no-cache directive', async () => {
    const store = new MemoryCacheStore()
    let requestCount = 0
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      ++requestCount
      res.setHeader('Vary', 'Accept-Encoding')
      res.setHeader('cache-control', 'no-cache')
      res.end(`Request count: ${requestCount}`)
    })

    after(async () => {
      server.close()

      await once(server, 'close')
    })

    await new Promise(resolve => server.listen(0, resolve))
    const { port } = server.address()
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

    const res1 = await request(url, {})
    const body1 = await res1.body.text()
    assert.strictEqual(body1, 'Request count: 1')
    assert.strictEqual(requestCount, 1)

    const res2 = await request(url, {})
    const body2 = await res2.body.text()
    assert.strictEqual(body2, 'Request count: 2')
    assert.strictEqual(requestCount, 2)

    await new Promise(resolve => server.close(resolve))
  })
})
