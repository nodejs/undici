'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')

test('handle headers as array', (t) => {
  t.plan(1)
  const headers = ['a', '1', 'b', '2', 'c', '3']

  const server = createServer((req, res) => {
    t.similar(req.headers, { a: '1', b: '2', c: '3' })
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers: headers
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
      headers: headers
    }, (err) => {
      t.ok(err instanceof errors.InvalidArgumentError)
      t.strictEqual(err.message, 'headers array must be even')
    })
  })
})
