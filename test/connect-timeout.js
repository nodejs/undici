'use strict'

const { test } = require('tap')
const { Client, Pool, errors } = require('..')
const net = require('net')

// Never connect
net.connect = function (options) {
  return new net.Socket(options)
}

test('connect-timeout', t => {
  t.plan(1)

  const client = new Client('http://localhost:9000', {
    connectTimeout: 1e3
  })
  t.teardown(client.close.bind(client))

  const timeout = setTimeout(() => {
    t.fail()
  }, 2e3)

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.type(err, errors.ConnectTimeoutError)
    clearTimeout(timeout)
  })
})

test('connect-timeout', t => {
  t.plan(1)

  const client = new Pool('http://localhost:9000', {
    connectTimeout: 1e3
  })
  t.teardown(client.close.bind(client))

  const timeout = setTimeout(() => {
    t.fail()
  }, 2e3)

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.type(err, errors.ConnectTimeoutError)
    clearTimeout(timeout)
  })
})
