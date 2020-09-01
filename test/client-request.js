'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/core/symbols')
const { Readable } = require('stream')

test('request abort before headers', (t) => {
  t.plan(2)

  const signal = new EE()
  const server = createServer((req, res) => {
    res.end('hello')
    signal.emit('abort')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
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

test('request body destroyed on invalid callback', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const body = new Readable({
      read () {}
    })
    try {
      client.request({
        path: '/',
        method: 'GET',
        body
      }, null)
    } catch (err) {
      t.strictEqual(body.destroyed, true)
    }
  })
})
