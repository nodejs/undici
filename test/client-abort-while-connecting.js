'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { setTimeout: delay } = require('node:timers/promises')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const net = require('node:net')
const { Client, Pool, errors, interceptors } = require('..')
const buildConnector = require('../lib/core/connect')

function requestOutcome (client, signal) {
  return new Promise((resolve) => {
    client.request({ path: '/', method: 'GET', signal }, (err) => resolve(err))
  })
}

test('#386 - abort while connecting rejects before the connector settles', async (t) => {
  let connectCallback
  let connectCalls = 0
  let callbackCalls = 0
  let connectionErrors = 0

  const client = new Client('http://localhost', {
    connect (_opts, callback) {
      connectCalls++
      connectCallback = callback
    }
  })
  client.on('connectionError', () => {
    connectionErrors++
  })
  t.after(() => client.destroy())

  const controller = new AbortController()
  const reason = new Error('request aborted while connecting')

  const outcome = new Promise((resolve) => {
    client.request({
      path: '/',
      method: 'GET',
      signal: controller.signal
    }, (err) => {
      callbackCalls++
      resolve(err)
    })
  })

  assert.strictEqual(connectCalls, 1)
  assert.strictEqual(typeof connectCallback, 'function')

  controller.abort(reason)

  const timeout = Symbol('timeout')
  const result = await Promise.race([
    outcome,
    delay(500, timeout, { ref: false })
  ])

  assert.notStrictEqual(result, timeout, 'request did not reject while the connector was pending')
  assert.strictEqual(result, reason)
  assert.strictEqual(callbackCalls, 1)

  connectCallback(Object.assign(new Error('late connector failure'), {
    code: 'ECONNREFUSED'
  }))

  await delay(0)
  assert.strictEqual(callbackCalls, 1)
  assert.strictEqual(connectionErrors, 0)
})

test('#386 - queued abort uses one user-signal listener', async (t) => {
  const client = new Client('http://localhost', {
    connect () {}
  })
  t.after(() => client.destroy())

  const signal = new EventEmitter()
  const outcome = requestOutcome(client, signal)

  assert.strictEqual(signal.listenerCount('abort'), 1)
  signal.emit('abort')

  assert.ok(await outcome instanceof errors.RequestAbortedError)
  assert.strictEqual(signal.listenerCount('abort'), 0)
})

test('#386 - shared connection attempt is cancelled only after every request aborts', async (t) => {
  const attempts = []
  let connectionErrors = 0

  const client = new Client('http://localhost', {
    connect (opts) {
      attempts.push(opts.signal)
    }
  })
  client.on('connectionError', () => {
    connectionErrors++
  })
  t.after(() => client.destroy())

  const first = new AbortController()
  const second = new AbortController()
  const firstReason = new Error('first request aborted')
  const secondReason = new Error('second request aborted')

  const firstOutcome = requestOutcome(client, first.signal)
  const secondOutcome = requestOutcome(client, second.signal)

  assert.strictEqual(attempts.length, 1)
  assert.ok(attempts[0] instanceof AbortSignal)

  first.abort(firstReason)
  assert.strictEqual(await firstOutcome, firstReason)
  await delay(0)
  assert.strictEqual(attempts[0].aborted, false)

  second.abort(secondReason)
  assert.strictEqual(await secondOutcome, secondReason)
  await delay(0)

  assert.strictEqual(attempts[0].aborted, true)
  assert.strictEqual(connectionErrors, 0)
})

test('#386 - a late socket from a cancelled attempt cannot replace a newer attempt', async (t) => {
  const attempts = []
  let connectEvents = 0

  const client = new Client('http://localhost', {
    connect (opts, callback) {
      attempts.push({ signal: opts.signal, callback })
    }
  })
  client.on('connect', () => {
    connectEvents++
  })
  t.after(() => client.destroy())

  const first = new AbortController()
  const firstReason = new Error('cancel first attempt')
  const firstOutcome = requestOutcome(client, first.signal)

  first.abort(firstReason)
  assert.strictEqual(await firstOutcome, firstReason)
  await delay(0)
  assert.strictEqual(attempts[0].signal.aborted, true)

  const second = new AbortController()
  const secondReason = new Error('cancel second attempt')
  const secondOutcome = requestOutcome(client, second.signal)

  assert.strictEqual(attempts.length, 2)
  assert.strictEqual(attempts[1].signal.aborted, false)

  const staleSocket = new PassThrough()
  attempts[0].callback(null, staleSocket)
  await delay(0)

  assert.strictEqual(staleSocket.destroyed, true)
  assert.strictEqual(connectEvents, 0)
  assert.strictEqual(attempts[1].signal.aborted, false)

  second.abort(secondReason)
  assert.strictEqual(await secondOutcome, secondReason)
  await delay(0)
  assert.strictEqual(attempts[1].signal.aborted, true)
})

test('#386 - the built-in connector destroys a pending socket when its attempt aborts', async (t) => {
  const socket = new net.Socket()
  t.mock.method(net, 'connect', () => socket)

  const connector = buildConnector({ timeout: 0 })
  const controller = new AbortController()
  const reason = new Error('connection attempt is no longer needed')
  let callbackCalls = 0

  const outcome = new Promise((resolve) => {
    connector({
      hostname: 'localhost',
      host: 'localhost',
      protocol: 'http:',
      port: '80',
      signal: controller.signal
    }, (err) => {
      callbackCalls++
      resolve(err)
    })
  })

  controller.abort(reason)

  assert.strictEqual(await outcome, reason)
  assert.strictEqual(socket.destroyed, true)
  assert.strictEqual(callbackCalls, 1)
})

test('#386 - queued abort propagates through a composed retry interceptor', async (t) => {
  let attemptSignal
  const baseClient = new Client('http://localhost', {
    connect (opts) {
      attemptSignal = opts.signal
    }
  })
  const client = baseClient.compose(interceptors.retry())
  t.after(() => client.destroy())

  const controller = new AbortController()
  const reason = new Error('composed request aborted while connecting')
  const outcome = requestOutcome(client, controller.signal)

  controller.abort(reason)

  assert.strictEqual(await outcome, reason)
  await delay(0)
  assert.strictEqual(attemptSignal.aborted, true)
})

for (const api of ['stream', 'connect', 'upgrade']) {
  test(`#386 - ${api} aborts while its connector is pending`, async (t) => {
    const attempts = []
    const client = new Client('http://localhost', {
      connect (opts) {
        attempts.push(opts.signal)
      }
    })
    t.after(() => client.destroy())

    const controller = new AbortController()
    const reason = new Error(`${api} aborted while connecting`)
    let factoryCalls = 0

    const outcome = new Promise((resolve) => {
      const opts = { path: '/', method: 'GET', signal: controller.signal }
      if (api === 'stream') {
        client.stream(opts, () => {
          factoryCalls++
          return new PassThrough()
        }, resolve)
      } else {
        client[api](opts, resolve)
      }
    })

    assert.strictEqual(attempts.length, 1)
    controller.abort(reason)

    assert.strictEqual(await outcome, reason)
    assert.strictEqual(factoryCalls, 0)
    await delay(0)
    assert.strictEqual(attempts[0].aborted, true)
  })
}

test('#386 - pipeline aborts while its connector is pending', async (t) => {
  const attempts = []
  const client = new Client('http://localhost', {
    connect (opts) {
      attempts.push(opts.signal)
    }
  })
  t.after(() => client.destroy())

  const controller = new AbortController()
  const reason = new Error('pipeline aborted while connecting')
  let handlerCalls = 0
  const duplex = client.pipeline({
    path: '/',
    method: 'GET',
    signal: controller.signal
  }, () => {
    handlerCalls++
    return new PassThrough()
  })
  const outcome = new Promise((resolve) => duplex.once('error', resolve))

  duplex.end()
  await delay(0)
  assert.strictEqual(attempts.length, 1)

  controller.abort(reason)

  assert.strictEqual(await outcome, reason)
  assert.strictEqual(handlerCalls, 0)
  await delay(0)
  assert.strictEqual(attempts[0].aborted, true)
})

test('#386 - cancelling a Pool attempt does not evict the client or block close', async () => {
  const attempts = []
  let connectionErrors = 0

  const pool = new Pool('http://localhost', {
    connections: 1,
    connect (opts) {
      attempts.push(opts.signal)
    }
  })
  pool.on('connectionError', () => {
    connectionErrors++
  })

  const first = new AbortController()
  const firstOutcome = requestOutcome(pool, first.signal)
  first.abort(new Error('first pool request aborted'))
  await firstOutcome
  await delay(0)

  const second = new AbortController()
  const secondOutcome = requestOutcome(pool, second.signal)

  assert.strictEqual(attempts.length, 2)
  assert.strictEqual(attempts[0].aborted, true)
  assert.strictEqual(attempts[1].aborted, false)
  assert.strictEqual(connectionErrors, 0)

  second.abort(new Error('second pool request aborted'))
  await secondOutcome
  await pool.close()

  assert.strictEqual(attempts[1].aborted, true)
  assert.strictEqual(connectionErrors, 0)
})
