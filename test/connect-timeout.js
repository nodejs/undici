'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const net = require('net')

test('connect-timeout', t => {
  t.plan(1)

  const client = new Client('http://localhost:9000', {
    connectTimeout: 1e3
  })
  t.teardown(client.close.bind(client))

  // Never connect
  net.connect = function (options) {
    return new net.Socket(options)
  }

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
