'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/symbols')

test('request abort before headers', (t) => {
  t.plan(2)

  let onRes
  const server = createServer((req, res) => {
    res.end('hello')
    onRes()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const signal = new EE()
    onRes = () => {
      t.pass()
      signal.emit('abort')
    }

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
})
