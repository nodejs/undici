'use strict'

const t = require('tap')
const { test } = t
const { createServer } = require('http')
const { Client, errors } = require('..')

const server = createServer((req, res) => {
  res.setHeader('content-type', 'text/plain')
  res.end('hello')
  t.fail('server should never be called')
})
t.tearDown(server.close.bind(server))

server.listen(0, () => {
  const url = `http://localhost:${server.address().port}`

  test('path', (t) => {
    t.plan(6)

    const client = new Client(url)
    t.tearDown(client.close.bind(client))

    client.request({ path: null, method: 'GET' }, (err, res) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'path must be a valid path')
      t.strictEqual(res, null)
    })

    client.request({ path: 'aaa', method: 'GET' }, (err, res) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'path must be a valid path')
      t.strictEqual(res, null)
    })
  })

  test('method', (t) => {
    t.plan(3)

    const client = new Client(url)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: null }, (err, res) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'method must be a string')
      t.strictEqual(res, null)
    })
  })

  test('body', (t) => {
    t.plan(6)

    const client = new Client(url)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: 42 }, (err, res) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'body must be a string, a Buffer or a Readable stream')
      t.strictEqual(res, null)
    })

    client.request({ path: '/', method: 'POST', body: { hello: 'world' } }, (err, res) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'body must be a string, a Buffer or a Readable stream')
      t.strictEqual(res, null)
    })
  })
})
