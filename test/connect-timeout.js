'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after, describe } = require('node:test')
const { Client, Pool, errors } = require('..')
const net = require('node:net')
const assert = require('node:assert')

// Using describe instead of test to avoid the timeout
describe('prioritize socket errors over timeouts', async () => {
  const t = tspl({ ...assert, after: () => {} }, { plan: 1 })
  const client = new Pool('http://foorbar.invalid:1234', { connectTimeout: 1 })

  client.request({ method: 'GET', path: '/foobar' })
    .then(() => t.fail())
    .catch((err) => {
      t.strictEqual(err.code !== 'UND_ERR_CONNECT_TIMEOUT', true)
    })

  // block for 1s which is enough for the dns lookup to complete and the
  // Timeout to fire
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(1000))

  await t.completed
})

// mock net.connect to avoid the dns lookup
net.connect = function (options) {
  return new net.Socket(options)
}

test('connect-timeout', async t => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:9000', {
    connectTimeout: 1e3
  })
  after(() => client.close())

  const timeout = setTimeout(() => {
    t.fail()
  }, 2e3)

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.ok(err instanceof errors.ConnectTimeoutError)
    clearTimeout(timeout)
  })

  await t.completed
})

test('connect-timeout', async t => {
  t = tspl(t, { plan: 1 })

  const client = new Pool('http://localhost:9000', {
    connectTimeout: 1e3
  })
  after(() => client.close())

  const timeout = setTimeout(() => {
    t.fail()
  }, 2e3)

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.ok(err instanceof errors.ConnectTimeoutError)
    clearTimeout(timeout)
  })

  await t.completed
})
