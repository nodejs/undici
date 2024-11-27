'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { kConnect } = require('../lib/core/symbols')
const { kBusy, kPending, kRunning } = require('../lib/core/symbols')

test('pipeline pipelining', async (t) => {
  t = tspl(t, { plan: 10 })

  const server = createServer((req, res) => {
    t.deepStrictEqual(req.headers['transfer-encoding'], undefined)
    res.end()
  })

  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    after(() => client.close())

    client[kConnect](() => {
      t.equal(client[kRunning], 0)
      client.pipeline({
        method: 'GET',
        path: '/',
        blocking: false
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.deepStrictEqual(client[kRunning], 0)
      t.deepStrictEqual(client[kPending], 1)

      client.pipeline({
        method: 'GET',
        path: '/',
        blocking: false
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.deepStrictEqual(client[kRunning], 0)
      t.deepStrictEqual(client[kPending], 2)
      process.nextTick(() => {
        t.equal(client[kRunning], 2)
      })
    })
  })

  await t.completed
})

test('pipeline pipelining retry', async (t) => {
  t = tspl(t, { plan: 13 })

  let count = 0
  const server = createServer((req, res) => {
    if (count++ === 0) {
      res.destroy()
    } else {
      res.end()
    }
  })

  after(() => server.close())
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    after(() => client.destroy())

    client.once('disconnect', () => {
      t.ok(true, 'pass')
    })

    client[kConnect](() => {
      client.pipeline({
        method: 'GET',
        path: '/',
        blocking: false
      }, ({ body }) => body).end().resume()
        .on('error', (err) => {
          t.ok(err)
        })
      t.equal(client[kBusy], true)
      t.deepStrictEqual(client[kRunning], 0)
      t.deepStrictEqual(client[kPending], 1)

      client.pipeline({
        method: 'GET',
        path: '/',
        blocking: false
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.deepStrictEqual(client[kRunning], 0)
      t.deepStrictEqual(client[kPending], 2)

      client.pipeline({
        method: 'GET',
        path: '/',
        blocking: false
      }, ({ body }) => body).end().resume()
      t.equal(client[kBusy], true)
      t.deepStrictEqual(client[kRunning], 0)
      t.deepStrictEqual(client[kPending], 3)

      process.nextTick(() => {
        t.equal(client[kRunning], 3)
      })

      client.close(() => {
        t.ok(true, 'pass')
      })
    })
  })

  await t.completed
})
