'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { strictEqual } = require('node:assert')
const { setTimeout: sleep } = require('node:timers/promises')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client, interceptors, cacheStores: { MemoryCacheStore } } = require('../../index')

describe('Cache Interceptor Request Deduplication', () => {
  test('deduplicates concurrent requests for the same cacheable resource', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      // Simulate slow response to ensure requests overlap
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('response-body')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send multiple concurrent requests
    const [res1, res2, res3] = await Promise.all([
      client.request(request),
      client.request(request),
      client.request(request)
    ])

    // Only one request should have reached the origin
    strictEqual(requestsToOrigin, 1)

    // All responses should have the same body
    const [body1, body2, body3] = await Promise.all([
      res1.body.text(),
      res2.body.text(),
      res3.body.text()
    ])

    strictEqual(body1, 'response-body')
    strictEqual(body2, 'response-body')
    strictEqual(body3, 'response-body')
  })

  test('deduplicates concurrent requests with same vary headers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('vary', 'accept-encoding')
      res.end(`response for ${req.headers['accept-encoding']}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'accept-encoding': 'gzip'
      }
    }

    // Send concurrent requests with same vary header value
    const [res1, res2] = await Promise.all([
      client.request(request),
      client.request(request)
    ])

    strictEqual(requestsToOrigin, 1)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for gzip')
    strictEqual(body2, 'response for gzip')
  })

  test('does not deduplicate requests with different vary header values', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('vary', 'accept-encoding')
      res.end(`response for ${req.headers['accept-encoding']}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const requestGzip = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'accept-encoding': 'gzip'
      }
    }

    const requestBr = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'accept-encoding': 'br'
      }
    }

    // Send concurrent requests with different vary header values
    const [res1, res2] = await Promise.all([
      client.request(requestGzip),
      client.request(requestBr)
    ])

    // Both should reach origin since they have different vary header values
    strictEqual(requestsToOrigin, 2)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for gzip')
    strictEqual(body2, 'response for br')
  })

  test('does not deduplicate requests with different paths', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end(`response for ${req.url}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Send concurrent requests to different paths
    const [res1, res2] = await Promise.all([
      client.request({ origin: 'localhost', method: 'GET', path: '/a' }),
      client.request({ origin: 'localhost', method: 'GET', path: '/b' })
    ])

    // Both should reach origin
    strictEqual(requestsToOrigin, 2)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for /a')
    strictEqual(body2, 'response for /b')
  })

  test('propagates errors to all waiting handlers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(50)
      // Destroy the connection to simulate an error
      res.destroy()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send concurrent requests that will all fail
    const results = await Promise.allSettled([
      client.request(request),
      client.request(request),
      client.request(request)
    ])

    // Only one request should have reached the origin
    strictEqual(requestsToOrigin, 1)

    // All should have failed
    strictEqual(results[0].status, 'rejected')
    strictEqual(results[1].status, 'rejected')
    strictEqual(results[2].status, 'rejected')
  })

  test('subsequent requests after deduplication are served from cache', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('cached-response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // First batch of concurrent requests
    await Promise.all([
      client.request(request),
      client.request(request)
    ])
    strictEqual(requestsToOrigin, 1)

    // Subsequent request should be from cache
    const res = await client.request(request)
    strictEqual(requestsToOrigin, 1)
    strictEqual(await res.body.text(), 'cached-response')
  })

  test('deduplication works with non-cacheable responses', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 'no-store')
      res.end('non-cached-response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Concurrent requests for non-cacheable response should still be deduplicated
    const [res1, res2] = await Promise.all([
      client.request(request),
      client.request(request)
    ])

    strictEqual(requestsToOrigin, 1)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'non-cached-response')
    strictEqual(body2, 'non-cached-response')

    // But subsequent requests should NOT be cached
    const res3 = await client.request(request)
    strictEqual(requestsToOrigin, 2)
    strictEqual(await res3.body.text(), 'non-cached-response')
  })

  test('deduplication respects request cache-control no-store', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const normalRequest = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    const noStoreRequest = {
      origin: 'localhost',
      method: 'GET',
      path: '/',
      headers: {
        'cache-control': 'no-store'
      }
    }

    // no-store requests bypass deduplication entirely
    const [res1, res2] = await Promise.all([
      client.request(normalRequest),
      client.request(noStoreRequest)
    ])

    // Both should reach origin since no-store bypasses the cache interceptor
    strictEqual(requestsToOrigin, 2)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response')
    strictEqual(body2, 'response')
  })

  test('deduplication cleans up pending requests after completion', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(50)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('response')
    }).listen(0)

    const store = new MemoryCacheStore()
    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache({ store }))

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // First batch
    await Promise.all([
      client.request(request),
      client.request(request)
    ])
    strictEqual(requestsToOrigin, 1)

    // Delete from cache to force new request
    // The cache key uses the origin from the request object, not the full client URL
    store.delete({ origin: 'localhost', method: 'GET', path: '/' })

    // Second batch - should create new pending request since old one is complete
    await Promise.all([
      client.request(request),
      client.request(request)
    ])
    strictEqual(requestsToOrigin, 2)
  })

  test('deduplication works with chunked response bodies', async () => {
    let requestsToOrigin = 0
    const bodyPart = 'chunk-data-'

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('transfer-encoding', 'chunked')
      // Send multiple chunks
      for (let i = 0; i < 5; i++) {
        res.write(bodyPart + i)
        await sleep(10)
      }
      res.end()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send concurrent requests
    const [res1, res2] = await Promise.all([
      client.request(request),
      client.request(request)
    ])

    strictEqual(requestsToOrigin, 1)

    const expectedBody = 'chunk-data-0chunk-data-1chunk-data-2chunk-data-3chunk-data-4'
    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, expectedBody)
    strictEqual(body2, expectedBody)
  })

  test('all response properties are available to deduplicated handlers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.setHeader('x-custom-header', 'custom-value')
      res.statusCode = 201
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    const [res1, res2] = await Promise.all([
      client.request(request),
      client.request(request)
    ])

    strictEqual(requestsToOrigin, 1)

    // Both responses should have the same status code and headers
    strictEqual(res1.statusCode, 201)
    strictEqual(res2.statusCode, 201)
    strictEqual(res1.headers['x-custom-header'], 'custom-value')
    strictEqual(res2.headers['x-custom-header'], 'custom-value')

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response')
    strictEqual(body2, 'response')
  })

  test('diagnostic channel tracks pending requests correctly', async () => {
    const events = []
    const channel = diagnosticsChannel.channel('undici:cache:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      channel.unsubscribe(onMessage)
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send concurrent requests
    await Promise.all([
      client.request(request),
      client.request(request)
    ])

    // Should have seen: added (size=1), removed (size=0)
    strictEqual(events.length, 2)
    strictEqual(events[0].type, 'added')
    strictEqual(events[0].size, 1)
    strictEqual(events[1].type, 'removed')
    strictEqual(events[1].size, 0)
  })

  test('diagnostic channel shows cleanup after error', async () => {
    const events = []
    const channel = diagnosticsChannel.channel('undici:cache:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      await sleep(50)
      res.destroy() // Simulate error
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      channel.unsubscribe(onMessage)
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const request = {
      origin: 'localhost',
      method: 'GET',
      path: '/'
    }

    // Send concurrent requests that will error
    await Promise.allSettled([
      client.request(request),
      client.request(request)
    ])

    // Should have seen: added (size=1), removed (size=0)
    strictEqual(events.length, 2)
    strictEqual(events[0].type, 'added')
    strictEqual(events[0].size, 1)
    strictEqual(events[1].type, 'removed')
    strictEqual(events[1].size, 0)
  })

  test('diagnostic channel tracks multiple pending requests separately', async () => {
    const events = []
    const channel = diagnosticsChannel.channel('undici:cache:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    let requestsToOrigin = 0

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end(`response for ${req.url}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      channel.unsubscribe(onMessage)
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Send requests to two different paths concurrently
    await Promise.all([
      client.request({ origin: 'localhost', method: 'GET', path: '/a' }),
      client.request({ origin: 'localhost', method: 'GET', path: '/b' }),
      client.request({ origin: 'localhost', method: 'GET', path: '/a' }), // Deduplicated with first
      client.request({ origin: 'localhost', method: 'GET', path: '/b' })  // Deduplicated with second
    ])

    // Should have 2 origin requests (one for /a, one for /b)
    strictEqual(requestsToOrigin, 2)

    // Should have 4 events: 2 added, 2 removed
    strictEqual(events.length, 4)

    // First two should be 'added' events with sizes 1 and 2
    const addedEvents = events.filter(e => e.type === 'added')
    const removedEvents = events.filter(e => e.type === 'removed')

    strictEqual(addedEvents.length, 2)
    strictEqual(removedEvents.length, 2)
    strictEqual(addedEvents[0].size, 1)
    strictEqual(addedEvents[1].size, 2)
    strictEqual(removedEvents[removedEvents.length - 1].size, 0) // All cleaned up
  })
})
