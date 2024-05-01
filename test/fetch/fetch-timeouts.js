'use strict'

const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')

const { fetch, Agent } = require('../..')
const timers = require('../../lib/util/timers')
const { createServer } = require('node:http')
const FakeTimers = require('@sinonjs/fake-timers')
const { closeServerAsPromise } = require('../utils/node-http')

test('Fetch very long request, timeout overridden so no error', (t, done) => {
  const minutes = 6
  const msToDelay = 1000 * 60 * minutes

  const { strictEqual } = tspl(t, { plan: 1 })

  const clock = FakeTimers.install()
  t.after(clock.uninstall.bind(clock))

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  t.after(() => {
    Object.assign(timers, orgTimers)
  })

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, msToDelay)
    clock.tick(msToDelay + 1)
  })
  t.after(closeServerAsPromise(server))

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
        strictEqual('hello', response)
        done()
      })
      .catch((err) => {
        // This should not happen, a timeout error should not occur
        throw err
      })

    clock.tick(msToDelay - 1)
  })
})
