'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const { kConnect } = require('../lib/core/symbols')
const { kBusy, kPending, kRunning } = require('../lib/core/symbols')

test('pipeline pipelining', (t) => {
  t.plan(10)

  const server = createServer((req, res) => {
    t.strictSame(req.headers['transfer-encoding'], undefined)
    res.end()
  })

  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.close.bind(client))

    client[kConnect](() => {
      t.equal(client[kRunning], 0)
      client.pipeline({
        method: 'GET',
        path: '/'
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.strictSame(client[kRunning], 0)
      t.strictSame(client[kPending], 1)

      client.pipeline({
        method: 'GET',
        path: '/'
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.strictSame(client[kRunning], 0)
      t.strictSame(client[kPending], 2)
      process.nextTick(() => {
        t.equal(client[kRunning], 2)
      })
    })
  })
})

test('pipeline pipelining retry', (t) => {
  t.plan(13)

  let count = 0
  const server = createServer((req, res) => {
    if (count++ === 0) {
      res.destroy()
    } else {
      res.end()
    }
  })

  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.destroy.bind(client))

    client.once('disconnect', () => {
      t.ok(true, 'pass')
    })

    client[kConnect](() => {
      client.pipeline({
        method: 'GET',
        path: '/'
      }, ({ body }) => body).end().resume()
        .on('error', (err) => {
          t.ok(err)
        })
      t.equal(client[kBusy], true)
      t.strictSame(client[kRunning], 0)
      t.strictSame(client[kPending], 1)

      client.pipeline({
        method: 'GET',
        path: '/'
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.strictSame(client[kRunning], 0)
      t.strictSame(client[kPending], 2)

      client.pipeline({
        method: 'GET',
        path: '/'
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.strictSame(client[kRunning], 0)
      t.strictSame(client[kPending], 3)

      process.nextTick(() => {
        t.equal(client[kRunning], 3)
      })

      client.close(() => {
        t.ok(true, 'pass')
      })
    })
  })
})
