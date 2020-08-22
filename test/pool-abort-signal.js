'use strict'

const { test } = require('tap')
const { Pool, errors } = require('..')
const EE = require('events')
const http = require('http')

test('Abort before sending request (no body)', (t) => {
  t.plan(3)

  let count = 0
  const server = http.createServer((req, res) => {
    if (count++ === 0) {
      res.end()
    } else {
      t.fail()
    }
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1
    })
    const ee = new EE()
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, response) => {
      t.error(err)
      response.body.resume().on('end', () => {
        t.pass()
      })
    })

    client.request({
      path: '/',
      method: 'GET',
      signal: ee
    }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })
})
