'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')

test('close waits for the in-flight requests to finish', (t) => {
  t.plan(10)

  const server = createServer()

  server.on('request', (req, res) => {
    t.pass('request received')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    client.request({ path: '/', method: 'GET' }, function (err, data) {
      onRequest(err, data)

      client.request({ path: '/', method: 'GET' }, onRequest)
      client.request({ path: '/', method: 'GET' }, reqClosed)
      client.request({ path: '/', method: 'GET' }, reqClosed)

      // needed because the next element in the queue will be called
      // after the current function completes
      process.nextTick(function () {
        client.close()
      })
    })
  })

  function onRequest (err, { statusCode, headers, body }) {
    t.error(err)
    t.strictEqual(statusCode, 200)
    const bufs = []
    body.on('data', (buf) => {
      bufs.push(buf)
    })
    body.on('end', () => {
      t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
    })
  }

  function reqClosed (err) {
    t.equal(err.message, 'The client is closed')
  }
})
