'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const errors = require('../lib/core/errors')

test('response trailers missing', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    }, (err, data) => {
      t.error(err)
      data.body.on('error', (err) => {
        t.ok(err instanceof errors.TrailerMismatchError)
      })
    })
  })
})

test('response trailers missing w trailers', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.addTrailers({
      asd: 'foo'
    })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    }, (err, data) => {
      t.error(err)
      data.body.on('error', (err) => {
        t.ok(err instanceof errors.TrailerMismatchError)
      })
    })
  })
})
