'use strict'

const { test } = require('tap')

const { fetch, Agent } = require('../../')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

const minutes = 6
const msToDelay = 1000 * 60 * minutes

const agent = new Agent({
  headersTimeout: 0,
  connectTimeout: 0,
  bodyTimeout: 0
})

test('Long time for a single fetch', (t) => {
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
      dispatcher: agent
    })
      .then((response) => response.text())
      .then((response) => {
        t.equal('hello', response)
        t.end()
      })
      .catch((err) => {
        console.error(err)
        t.error(err)
      })

    clock.tick(msToDelay - 1)
  })
})
