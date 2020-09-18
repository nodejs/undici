'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('multiple reconnect', (t) => {
  t.plan(5)

  let n = 0
  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((req, res) => {
    n === 0 ? res.destroy() : res.end('ok')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ok(err)
      t.is(err.code, 'UND_ERR_SOCKET')
    })

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })

    client.on('disconnect', () => {
      if (++n === 1) {
        t.pass()
      }
      process.nextTick(() => {
        clock.tick(1000)
      })
    })
  })
})
