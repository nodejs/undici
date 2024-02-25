'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const FakeTimers = require('@sinonjs/fake-timers')
const timers = require('../lib/util/timers')

test('multiple reconnect', async (t) => {
  t = tspl(t, { plan: 5 })

  let n = 0
  const clock = FakeTimers.install()
  after(() => clock.uninstall())

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  after(() => {
    Object.assign(timers, orgTimers)
  })

  const server = createServer((req, res) => {
    n === 0 ? res.destroy() : res.end('ok')
  })
  after(() => server.close())

  server.listen(0)
  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    t.ok(err)
    t.strictEqual(err.code, 'UND_ERR_SOCKET')
  })

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    t.ifError(err)
    data.body
      .resume()
      .on('end', () => {
        t.ok(true, 'pass')
      })
  })

  client.on('disconnect', () => {
    if (++n === 1) {
      t.ok(true, 'pass')
    }
    process.nextTick(() => {
      clock.tick(1000)
    })
  })
  await t.completed
})
