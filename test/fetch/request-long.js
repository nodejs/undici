'use strict'

const { test } = require('tap')

const { Client } = require('../..')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

const minutes = 6
const msToDelay = 1000 * 60 * minutes

test('Long time for a single request', (t) => {
  t.setTimeout(undefined)

  t.plan(2)

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
    const client = new Client(`http://localhost:${server.address().port}`, {
      headersTimeout: 0,
      connectTimeout: 0
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    clock.tick(msToDelay - 1)
  })
})
