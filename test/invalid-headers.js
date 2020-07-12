'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')

test('invalid headers', (t) => {
  t.plan(3)

  const client = new Client('http://localhost:3000')
  t.teardown(client.destroy.bind(client))
  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'content-length': 'asd'
    }
  }, (err, data) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      'transfer-encoding': 'chunked'
    }
  }, (err, data) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  client.request({
    path: '/',
    method: 'GET',
    headers: {
      asd: null
    }
  }, (err, data) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})
