'use strict'

const { test } = require('tap')

const { fetch, Agent } = require('../..')
const timers = require('../../lib/timers')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('Fetch very long request, timeout overridden so no error', (t) => {
  const minutes = 6
  const msToDelay = 1000 * 60 * minutes

  t.setTimeout(undefined)
  t.plan(1)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  t.teardown(() => {
    Object.assign(timers, orgTimers)
  })

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
