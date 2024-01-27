'use strict'

const { test } = require('tap')
const { Client, Pool, errors } = require('..')
const net = require('net')
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms))

test('prioritize socket errors over timeouts', (t) => {
  t.plan(1)
  const connectTimeout = 1000
  const client = new Pool('http://foobar.bar:1234', { connectTimeout: 2 })

  client.request({ method: 'GET', path: '/foobar' })
    .then(() => t.fail())
    .catch((err) => {
      t.equal(err.code, 'ENOTFOUND')
    })

  // block for 1s which is enough for the dns lookup to complete and TO to fire
  sleep(connectTimeout)
})

// never connect
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
