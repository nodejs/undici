'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('node:http')

test('handle headers as array', (t) => {
  t.plan(1)
  const headers = ['a', '1', 'b', '2', 'c', '3']

  const server = createServer((req, res) => {
    t.match(req.headers, { a: '1', b: '2', c: '3' })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, () => {})
  })
})

test('handle multi-valued headers as array', (t) => {
  t.plan(1)
  const headers = ['a', '1', 'b', '2', 'c', '3', 'd', '4', 'd', '5']

  const server = createServer((req, res) => {
    t.match(req.headers, { a: '1', b: '2', c: '3', d: '4, 5' })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, () => {})
  })
})

test('handle headers with array', (t) => {
  t.plan(1)
  const headers = { a: '1', b: '2', c: '3', d: ['4'] }

  const server = createServer((req, res) => {
    t.match(req.headers, { a: '1', b: '2', c: '3', d: '4' })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, () => {})
  })
})

test('handle multi-valued headers', (t) => {
  t.plan(1)
  const headers = { a: '1', b: '2', c: '3', d: ['4', '5'] }

  const server = createServer((req, res) => {
    t.match(req.headers, { a: '1', b: '2', c: '3', d: '4, 5' })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, () => {})
  })
})

test('fail if headers array is odd', (t) => {
  t.plan(2)
  const headers = ['a', '1', 'b', '2', 'c', '3', 'd']

  const server = createServer((req, res) => { res.end() })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, (err) => {
      t.type(err, errors.InvalidArgumentError)
      t.equal(err.message, 'headers array must be even')
    })
  })
})

test('fail if headers is not an object or an array', (t) => {
  t.plan(2)
  const headers = 'not an object or an array'

  const server = createServer((req, res) => { res.end() })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers
    }, (err) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.equal(err.message, 'headers must be an object or an array')
    })
  })
})
