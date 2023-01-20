'use strict'

const { test } = require('tap')

const { fetch, errors, Agent } = require('../..')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('Fetch should have a default timeout of 300 seconds triggered', (t) => {
  const msToDelay = 300_000
  t.setTimeout(undefined)
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, msToDelay)
    clock.tick(msToDelay + 1)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`, {
      path: '/',
      method: 'GET',
      dispatcher: new Agent({
        connectTimeout: 0
      })
    })
      .then(() => {
        // This should not happen, a timeout error should occur
        t.error(true)
      })
      .catch((err) => {
        t.type(err.cause, errors.HeadersTimeoutError)
      })

    clock.tick(msToDelay - 1)
  })
})

test('Fetch should have a default timeout of 300 seconds not triggered', (t) => {
  const msToDelay = 299_000
  t.setTimeout(undefined)
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, msToDelay)
    clock.tick(msToDelay + 1)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`, {
      path: '/',
      method: 'GET',
      dispatcher: new Agent({
        connectTimeout: 0
      })
    })
      .then((response) => response.text())
      .then((response) => {
        t.equal('hello', response)
        t.end()
      })
      .catch((err) => {
        // This should not happen, a timeout error should not occur
        t.error(err)
      })

    clock.tick(msToDelay - 1)
  })
})

test('Fetch very long request, timeout overridden so no error', (t) => {
  const minutes = 6
  const msToDelay = 1000 * 60 * minutes

  t.setTimeout(undefined)
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, msToDelay)
    clock.tick(msToDelay + 1)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    fetch(`http://localhost:${server.address().port}`, {
      path: '/',
      method: 'GET',
      dispatcher: new Agent({
        headersTimeout: 0,
        connectTimeout: 0,
        bodyTimeout: 0
      })
    })
      .then((response) => response.text())
      .then((response) => {
        t.equal('hello', response)
        t.end()
      })
      .catch((err) => {
        // This should not happen, a timeout error should not occur
        t.error(err)
      })

    clock.tick(msToDelay - 1)
  })
})
