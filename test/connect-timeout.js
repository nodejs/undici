'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, describe } = require('node:test')
const { Client, Pool, errors } = require('..')
const net = require('node:net')
const assert = require('node:assert')

const skip = !!process.env.CITGM

// Using describe instead of test to avoid the timeout
describe('prioritize socket errors over timeouts', { skip }, async () => {
  const t = tspl({ ...assert, after: () => {} }, { plan: 2 })
  const client = new Pool('http://foorbar.invalid:1234', { connectTimeout: 1 })

  client.request({ method: 'GET', path: '/foobar' })
    .then(() => t.fail())
    .catch((err) => {
      t.strictEqual(err.code, 'ENOTFOUND')
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

async function assertConnectTimeout (dispatcher, t) {
  const tt = tspl(t, { plan: 3 })

  await new Promise((resolve, reject) => {
    // Connection timeouts use FastTimers, which have a deliberately low
    // resolution, and Windows adds an extra setImmediate before timing out.
    const timeout = setTimeout(() => {
      dispatcher.destroy()
      reject(new Error('connect-timeout callback did not fire'))
    }, 5e3)

    dispatcher.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      try {
        tt.ok(err instanceof errors.ConnectTimeoutError)
        tt.strictEqual(err.code, 'UND_ERR_CONNECT_TIMEOUT')
        tt.strictEqual(err.message, 'Connect Timeout Error (attempted address: localhost:9000, timeout: 1000ms)')
        clearTimeout(timeout)
        resolve()
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  })

  await tt.completed
}

test('connect-timeout (Client)', { skip }, async t => {
  const client = new Client('http://localhost:9000', {
    connectTimeout: 1e3
  })
  t.after(() => client.close().catch(() => {}))

  await assertConnectTimeout(client, t)
})

test('connect-timeout (Pool)', { skip }, async t => {
  const client = new Pool('http://localhost:9000', {
    connectTimeout: 1e3
  })
  t.after(() => client.close().catch(() => {}))

  await assertConnectTimeout(client, t)
})

test('autoSelectFamily AggregateError with ETIMEDOUT is normalized to ConnectTimeoutError', { skip }, async t => {
  t = tspl(t, { plan: 5 })

  const aggregate = new AggregateError([
    Object.assign(new Error('connect ETIMEDOUT 127.0.0.1:9000'), { code: 'ETIMEDOUT' }),
    Object.assign(new Error('connect ETIMEDOUT ::1:9000'), { code: 'ETIMEDOUT' })
  ], 'connect ETIMEDOUT')
  aggregate.code = 'ETIMEDOUT'

  net.connect = function (options) {
    const socket = new net.Socket(options)
    socket.autoSelectFamilyAttemptedAddresses = ['127.0.0.1:9000', '::1:9000']
    setImmediate(() => {
      socket.destroy(aggregate)
    })
    return socket
  }

  const client = new Client('http://localhost:9000', {
    connectTimeout: 1e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err) => {
    t.ok(err instanceof errors.ConnectTimeoutError)
    t.strictEqual(err.code, 'UND_ERR_CONNECT_TIMEOUT')
    t.strictEqual(err.message, 'Connect Timeout Error (attempted addresses: 127.0.0.1:9000, ::1:9000, timeout: 1000ms)')
    t.ok(err.cause instanceof AggregateError)
    t.strictEqual(err.cause, aggregate)
  })

  await t.completed
})
