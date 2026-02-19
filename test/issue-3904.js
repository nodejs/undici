const { describe, test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const MemoryCacheStore = require('../lib/cache/memory-cache-store.js')
const { Agent, interceptors, request, setGlobalDispatcher } = require('..')

describe('Cache with cache-control: no-store request header', () => {
  [
    'CACHE-CONTROL',
    'cache-control',
    'Cache-Control'
  ].forEach(headerName => {
    test(`should not cache response for request with header: "${headerName}: no-store`, async (t) => {
      const store = new MemoryCacheStore()
      let requestCount = 0
      const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
        ++requestCount
        res.setHeader('Vary', 'Accept-Encoding')
        res.setHeader('Cache-Control', 'max-age=60')
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

      const res1 = await request(url, { headers: { [headerName]: 'no-store' } })
      const body1 = await res1.body.text()
      t.assert.strictEqual(body1, 'Request count: 1')
      t.assert.strictEqual(requestCount, 1)

      const res2 = await request(url)
      const body2 = await res2.body.text()
      t.assert.strictEqual(body2, 'Request count: 2')
      t.assert.strictEqual(requestCount, 2)

      await new Promise(resolve => server.close(resolve))
    })
  })
})
