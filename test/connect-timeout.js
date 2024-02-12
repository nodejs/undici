'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, Pool, errors } = require('..')
const net = require('node:net')
const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(ms))

test('prioritize socket errors over timeouts', async (t) => {
  t = tspl(t, { plan: 1 })
  const connectTimeout = 1000
  const client = new Pool('http://foobar.bar:1234', { connectTimeout: 2 })

  client.request({ method: 'GET', path: '/foobar' })
    .then(() => t.fail())
    .catch((err) => {
      t.strictEqual(err.code, 'ENOTFOUND')
    })

  // block for 1s which is enough for the dns lookup to complete and TO to fire
  sleep(connectTimeout)

  await t.completed
})

// never connect
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
