'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { strictEqual } = require('node:assert')
const { setTimeout: sleep } = require('node:timers/promises')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client, interceptors } = require('../../index')

describe('Deduplicate Interceptor', () => {
  test('deduplicates concurrent requests for the same resource', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      // Simulate slow response to ensure requests overlap
      await sleep(100)
      res.end('response-body')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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

  test('deduplicates concurrent requests with same headers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.headers['accept-encoding']}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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

    // Send concurrent requests with same header values
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

  test('does not deduplicate requests with different header values', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.headers['accept-encoding']}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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

    // Send concurrent requests with different header values
    const [res1, res2] = await Promise.all([
      client.request(requestGzip),
      client.request(requestBr)
    ])

    // Both should reach origin since they have different header values
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
      res.end(`response for ${req.url}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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
      .compose(interceptors.deduplicate())

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

  test('works with cache interceptor for cacheable responses', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.setHeader('cache-control', 's-maxage=10')
      res.end('cached-response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())
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
      .compose(interceptors.deduplicate())
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

  test('deduplication cleans up pending requests after completion', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(50)
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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

    // Second batch - should create new request since first batch is complete
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
      res.setHeader('transfer-encoding', 'chunked')
      // Send multiple chunks
      for (let i = 0; i < 5; i++) {
        res.write(bodyPart + i)
        await sleep(10)
      }
      res.end()
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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
      res.setHeader('x-custom-header', 'custom-value')
      res.statusCode = 201
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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
    const channel = diagnosticsChannel.channel('undici:request:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      await sleep(100)
      res.end('response')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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
    const channel = diagnosticsChannel.channel('undici:request:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      await sleep(50)
      res.destroy() // Simulate error
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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
    const channel = diagnosticsChannel.channel('undici:request:pending-requests')

    const onMessage = (message) => {
      events.push(message)
    }
    channel.subscribe(onMessage)

    let requestsToOrigin = 0

    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.url}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

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

  test('does not deduplicate requests with different Authorization headers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.headers.authorization}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Send concurrent requests with different Authorization headers
    const [res1, res2] = await Promise.all([
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { authorization: 'Bearer token-user-1' }
      }),
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { authorization: 'Bearer token-user-2' }
      })
    ])

    // Both requests should reach origin since they have different Authorization headers
    strictEqual(requestsToOrigin, 2)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for Bearer token-user-1')
    strictEqual(body2, 'response for Bearer token-user-2')
  })

  test('does not deduplicate requests with different Cookie headers', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.headers.cookie}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Send concurrent requests with different Cookie headers
    const [res1, res2] = await Promise.all([
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { cookie: 'session=user1-session-id' }
      }),
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { cookie: 'session=user2-session-id' }
      })
    ])

    // Both requests should reach origin since they have different Cookie headers
    strictEqual(requestsToOrigin, 2)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for session=user1-session-id')
    strictEqual(body2, 'response for session=user2-session-id')
  })

  test('deduplicates requests with same Authorization header', async () => {
    let requestsToOrigin = 0
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      requestsToOrigin++
      await sleep(100)
      res.end(`response for ${req.headers.authorization}`)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.deduplicate())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    // Send concurrent requests with the same Authorization header
    const [res1, res2] = await Promise.all([
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { authorization: 'Bearer same-token' }
      }),
      client.request({
        origin: 'localhost',
        method: 'GET',
        path: '/',
        headers: { authorization: 'Bearer same-token' }
      })
    ])

    // Only one request should reach origin since they have the same Authorization header
    strictEqual(requestsToOrigin, 1)

    const [body1, body2] = await Promise.all([
      res1.body.text(),
      res2.body.text()
    ])

    strictEqual(body1, 'response for Bearer same-token')
    strictEqual(body2, 'response for Bearer same-token')
  })
})
