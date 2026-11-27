'use strict'

const { createServer } = require('node:http')
const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const { strictEqual } = require('node:assert')
const FakeTimers = require('@sinonjs/fake-timers')
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
//
// The response delay is injected by advancing a fake clock inside the origin handler,
// which runs after the request was sent (fixing request_time) and before the response
// is received (fixing response_time). That makes the delay exact and deterministic
// rather than a real timer, which is flaky under load.
describe('Cache Interceptor - corrected age value', () => {
  test('adds the response delay to the origin Age header', async () => {
    const clock = FakeTimers.install({ toFake: ['Date'] })
    const delayMs = 2000
    const upstreamAge = 100

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      clock.tick(delayMs) // the response arrives delayMs after the request was sent
      res.setHeader('cache-control', 'public, max-age=600')
      res.setHeader('age', String(upstreamAge))
      res.setHeader('date', new Date().toUTCString())
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    const first = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await first.body.text()

    const second = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await second.body.text()

    // corrected_initial_age = age_value + response_delay = 100 + 2 = 102, and no time
    // passes between caching and serving, so the served age is exactly that.
    strictEqual(Number(second.headers.age), upstreamAge + delayMs / 1000)
  })

  test('ages a response without an Age header by the response delay alone', async () => {
    // RFC 9111 treats a missing Age header as age_value = 0, so corrected_age_value
    // reduces to the response delay itself and must not be counted twice.
    const clock = FakeTimers.install({ toFake: ['Date'] })
    const delayMs = 1000

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      clock.tick(delayMs)
      res.setHeader('cache-control', 'public, max-age=600')
      res.setHeader('date', new Date().toUTCString())
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
    })

    await once(server, 'listening')

    const first = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await first.body.text()

    const second = await client.request({ origin: 'localhost', method: 'GET', path: '/' })
    await second.body.text()

    strictEqual(Number(second.headers.age), delayMs / 1000)
  })

  test('serves a cache miss once the corrected age exceeds max-age', async () => {
    // The point of the correction. max-age is 3 and the origin reports an age of 2,
    // so an uncorrected cache stores this as fresh for another second. Adding the
    // 2 second response delay puts the corrected age at 4, already past max-age, so
    // the entry must not be reused.
    const clock = FakeTimers.install({ toFake: ['Date'] })
    let requestsToOrigin = 0

    const server = createServer({ joinDuplicateHeaders: true }, (_, res) => {
      requestsToOrigin++
      clock.tick(2000)
      res.setHeader('cache-control', 'public, max-age=3')
      res.setHeader('age', '2')
      res.setHeader('date', new Date().toUTCString())
      res.end('asd')
    }).listen(0)

    const client = new Client(`http://localhost:${server.address().port}`)
      .compose(interceptors.cache())

    after(async () => {
      server.close()
      await client.close()
      clock.uninstall()
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
