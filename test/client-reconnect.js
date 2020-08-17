'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('multiple reconnect', (t) => {
  t.plan(3)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  const client = new Client('http://localhost:5555')
  t.tearDown(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    t.error(err)
    data.body
      .resume()
      .on('end', () => {
        t.pass()
      })
  })

  let n = 0
  client.on('disconnect', () => {
    if (++n === 1) {
      t.pass()
      server.listen(5555)
    }
    process.nextTick(() => {
      clock.tick(1000)
    })
  })
})
