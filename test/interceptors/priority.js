'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { strictEqual, deepStrictEqual } = require('node:assert')
const { setTimeout: sleep } = require('node:timers/promises')
const { Client, interceptors } = require('../../index')

const { PRIORITIES } = interceptors.priority

describe('Priority Interceptor', () => {
  test('dispatches requests without priority normally', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end('ok')
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority())

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const res = await client.request({
      origin: `http://localhost:${server.address().port}`,
      method: 'GET',
      path: '/'
    })

    const body = await res.body.text()
    strictEqual(res.statusCode, 200)
    strictEqual(body, 'ok')
  })

  test('dispatches requests with priority', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end('ok')
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority())

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const res = await client.request({
      origin: `http://localhost:${server.address().port}`,
      method: 'GET',
      path: '/',
      priority: PRIORITIES.LOW
    })

    const body = await res.body.text()
    strictEqual(res.statusCode, 200)
    strictEqual(body, 'ok')
  })

  test('higher priority requests are dispatched first', async () => {
    const order = []
    const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
      await sleep(50)
      order.push(req.url)
      res.end(req.url)
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority({ concurrency: 1 }))

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const origin = `http://localhost:${server.address().port}`

    // Send requests with different priorities
    // With concurrency 1, the first request dispatches immediately.
    // The remaining requests queue by priority (higher = first).
    const results = await Promise.all([
      client.request({ origin, method: 'GET', path: '/first', priority: PRIORITIES.LOW }),
      client.request({ origin, method: 'GET', path: '/high', priority: PRIORITIES.HIGHEST }),
      client.request({ origin, method: 'GET', path: '/low', priority: PRIORITIES.LOWEST }),
      client.request({ origin, method: 'GET', path: '/medium', priority: PRIORITIES.MEDIUM })
    ])

    // Read all bodies to ensure completion
    for (const res of results) {
      await res.body.text()
    }

    // The first request dispatched immediately, then high, medium, low
    deepStrictEqual(order, ['/first', '/high', '/medium', '/low'])
  })

  test('requests without priority bypass the queue', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end('ok')
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority())

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const origin = `http://localhost:${server.address().port}`

    // Request without priority should go through directly
    const res = await client.request({
      origin,
      method: 'GET',
      path: '/'
    })

    const body = await res.body.text()
    strictEqual(res.statusCode, 200)
    strictEqual(body, 'ok')
  })

  test('rejects invalid priority values', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.end('ok')
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority())

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const origin = `http://localhost:${server.address().port}`

    await client.request({
      origin,
      method: 'GET',
      path: '/',
      priority: 99
    }).then(() => {
      throw new Error('should have thrown')
    }).catch((err) => {
      strictEqual(err.message.includes('Invalid priority'), true)
    })
  })

  test('handles request errors gracefully', async () => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.destroy()
    }).listen(0)

    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.priority())

    after(async () => {
      await client.close()
      server.close()
      await once(server, 'close')
    })

    const origin = `http://localhost:${server.address().port}`

    await client.request({
      origin,
      method: 'GET',
      path: '/',
      priority: 1
    }).then(() => {
      throw new Error('should have thrown')
    }).catch((err) => {
      strictEqual(err.code, 'UND_ERR_SOCKET')
    })
  })
})
