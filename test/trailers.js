'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')

test('response trailers missing is OK', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.end('response')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    })

    t.equal(await body.text(), 'response')
  })
})

test('response trailers missing w trailers is OK', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Trailer: 'content-length'
    })
    res.addTrailers({
      asd: 'foo'
    })
    res.end('response')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body, trailers } = await client.request({
      path: '/',
      method: 'GET',
      body: 'asd'
    })

    t.equal(await body.text(), 'response')
    t.same(trailers, { asd: 'foo' })
  })
})
