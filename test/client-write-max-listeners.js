'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')
const util = require('../lib/core/util')

test('socket close listener does not leak', (t) => {
  t.plan(32)

  const server = createServer()

  server.on('request', (req, res) => {
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  const makeBody = () => {
    return new Readable({
      read () {
        util.queueMicrotask(() => {
          this.push(null)
        })
      }
    })
  }

  const onRequest = (err, data) => {
    t.error(err)
    data.body.on('end', () => t.pass()).resume()
  }

  process.on('warning', () => {
    t.fail()
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.on('disconnect', () => {
      t.fail()
    })

    for (let n = 0; n < 16; ++n) {
      client.request({ path: '/', method: 'GET', body: makeBody() }, onRequest)
    }
  })
})
