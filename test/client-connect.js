'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client, errors } = require('..')
const http = require('node:http')
const EE = require('node:events')
const { kBusy } = require('../lib/core/symbols')

// TODO: move to test/node-test/client-connect.js
test('connect aborted after connect', async (t) => {
  t = tspl(t, { plan: 3 })

  const signal = new EE()
  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    signal.emit('abort')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    pipelining: 3
  })
  after(() => client.close())

  client.connect({
    path: '/',
    signal,
    opaque: 'asd',
    blocking: false
  }, (err, { opaque }) => {
    t.strictEqual(opaque, 'asd')
    t.ok(err instanceof errors.RequestAbortedError)
  })
  t.strictEqual(client[kBusy], true)

  await t.completed
})
