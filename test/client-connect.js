'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const http = require('http')
const EE = require('events')
const { kBusy } = require('../lib/core/symbols')

// TODO: move to test/node-test/client-connect.js
test('connect aborted after connect', (t) => {
  t.plan(3)

  const signal = new EE()
  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    signal.emit('abort')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.destroy.bind(client))

    client.connect({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.equal(opaque, 'asd')
      t.type(err, errors.RequestAbortedError)
    })
    t.equal(client[kBusy], true)
  })
})
