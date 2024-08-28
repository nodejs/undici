'use strict'

const { describe, test, after } = require('node:test')
const { strictEqual } = require('node:assert')
const { createServer } = require('node:http')
const { Client, interceptors } = require('../../index')
const { once } = require('node:events')

// e2e tests, checks just the public api stuff basically
describe('Cache Interceptor', () => {
  test('doesn\'t cache request w/ no cache-control header', async () => {
    let requestsToOrigin = 0

    const server = createServer((_, res) => {
      requestsToOrigin++
      res.end('asd')
    }).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    strictEqual(requestsToOrigin, 0)

    // Send initial request. This should reach the origin
    let response = await client.request({ method: 'GET', path: '/' })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await getResponse(response.body), 'asd')

    // Send second request that should be handled by cache
    response = await client.request({ method: 'GET', path: '/' })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await getResponse(response.body), 'asd')
  })

  test('caches request successfully', async () => {
    let requestsToOrigin = 0

    const server = createServer((_, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, s-maxage=10')
      res.end('asd')
    }).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    strictEqual(requestsToOrigin, 0)

    // Send initial request. This should reach the origin
    let response = await client.request({ method: 'GET', path: '/' })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await getResponse(response.body), 'asd')

    // Send second request that should be handled by cache
    response = await client.request({ method: 'GET', path: '/' })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await getResponse(response.body), 'asd')
    strictEqual(response.headers.age, '0')
  })

  test('respects vary header', async () => {
    let requestsToOrigin = 0

    const server = createServer((req, res) => {
      requestsToOrigin++
      res.setHeader('cache-control', 'public, s-maxage=10')
      res.setHeader('vary', 'some-header, another-header')

      if (req.headers['some-header'] === 'abc123') {
        res.end('asd')
      } else {
        res.end('dsa')
      }
    }).listen(0)

    after(() => server.close())
    await once(server, 'listening')

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    strictEqual(requestsToOrigin, 0)

    // Send initial request. This should reach the origin
    let response = await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'abc123',
        'another-header': '123abc'
      }
    })
    strictEqual(requestsToOrigin, 1)
    strictEqual(await getResponse(response.body), 'asd')

    // Make another request with changed headers, this should miss
    const secondResponse = await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'qwerty',
        'another-header': 'asdfg'
      }
    })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await getResponse(secondResponse.body), 'dsa')

    // Resend the first request again which should still be cahced
    response = await client.request({
      method: 'GET',
      path: '/',
      headers: {
        'some-header': 'abc123',
        'another-header': '123abc'
      }
    })
    strictEqual(requestsToOrigin, 2)
    strictEqual(await getResponse(response.body), 'asd')
  })
})

async function getResponse (body) {
  const buffers = []
  for await (const data of body) {
    buffers.push(data)
  }
  return Buffer.concat(buffers).toString('utf8')
}
