'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { ok, strictEqual } = require('node:assert')
const { Client, interceptors } = require('../../index')

// RFC 9111 section 4.2.3 computes a stored response's initial age as
//
//   response_delay        = response_time - request_time
//   corrected_age_value   = age_value + response_delay
//   corrected_initial_age = max(apparent_age, corrected_age_value)
//
// The response_delay term exists because the Age an origin reports was already out
// of date by the time the response finished arriving. Dropping it stores a slow
// response as younger than it is, so a cache sitting near its freshness boundary
// keeps serving after the response has actually expired.
describe('Cache Interceptor - corrected age value', () => {
  test('adds the response delay to the origin Age header', async () => {
    const delay = 2000
    const upstreamAge = 100

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      setTimeout(() => {
        res.setHeader('cache-control', 'public, max-age=600')
        res.setHeader('age', String(upstreamAge))
        res.setHeader('date', new Date().toUTCString())
        res.end('asd')
      }, delay)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const requestTime = Date.now()
    const first = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await first.body.text()
    // Floor, not round: the delay measured here spans strictly more than the
    // handler's request-to-headers window, so flooring keeps the expectation a
    // lower bound instead of failing when the two land on opposite sides of a
    // half-second boundary.
    const responseDelaySeconds = Math.floor((Date.now() - requestTime) / 1000)

    const second = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await second.body.text()

    const servedAge = Number(second.headers.age)
    ok(
      servedAge >= upstreamAge + responseDelaySeconds,
      `expected the served age to be at least ${upstreamAge + responseDelaySeconds} (origin age ${upstreamAge} plus a response delay of ${responseDelaySeconds}s), got ${servedAge}`
    )
  })

  test('ages a response without an Age header by at most the response delay', async () => {
    // RFC 9111 treats a missing Age header as age_value = 0, so for this response
    // corrected_age_value reduces to the response delay alone. The served age must
    // stay at roughly the 1 second delay and not count it twice.
    const delay = 1000

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      setTimeout(() => {
        res.setHeader('cache-control', 'public, max-age=600')
        res.setHeader('date', new Date().toUTCString())
        res.end('asd')
      }, delay)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const first = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await first.body.text()

    const second = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await second.body.text()

    ok(Number(second.headers.age) <= 2, `expected an age of at most the 1s response delay plus rounding, got ${second.headers.age}`)
  })

  test('serves a cache miss once the corrected age exceeds max-age', async () => {
    // The point of the correction. max-age is 3 and the origin reports an age of 2,
    // so an uncorrected cache stores this as fresh for another second. Adding the
    // 2 second response delay puts the corrected age at 4, already past max-age, so
    // the entry must not be reused.
    let requestsToOrigin = 0
    const delay = 2000

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      setTimeout(() => {
        res.setHeader('cache-control', 'public, max-age=3')
        res.setHeader('age', '2')
        res.setHeader('date', new Date().toUTCString())
        res.end('asd')
      }, delay)
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
    })

    await once(server, 'listening')

    const first = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await first.body.text()
    strictEqual(requestsToOrigin, 1)

    const second = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await second.body.text()
    strictEqual(requestsToOrigin, 2, 'a response already past max-age once the response delay is counted must not be served from cache')
  })
})
