'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { kSocket } = require('../lib/core/symbols')

test('stop error', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    while (res.write(Buffer.alloc(4096))) {
    }
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    makeRequest()

    client.once('connect', () => {
      client[kSocket]._handle.readStop = () => -100
    })

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.on('error', (err) => {
          t.strictEqual(err.code, -100)
        })
      })
      return client.size <= client.pipelining
    }
  })
})

test('resume error', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    while (res.write(Buffer.alloc(4096))) {
    }
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    makeRequest()

    function makeRequest () {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        data.body.pause()

        client[kSocket]._handle.readStart = () => -100

        data.body.on('error', (err) => {
          t.strictEqual(err.code, -100)
        })

        setTimeout(() => {
          data.body.resume()
        }, 100)
      })
      return client.size <= client.pipelining
    }
  })
})
