'use strict'

const { test, after } = require('node:test')
const { EventEmitter } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const { tspl } = require('@matteo.collina/tspl')

const connectH2 = require('../lib/dispatcher/client-h2')
const {
  kError,
  kHTTP2ConnectionWindowSize,
  kHTTP2InitialWindowSize,
  kMaxConcurrentStreams,
  kOnError,
  kPingInterval,
  kSocket,
  kUrl
} = require('../lib/core/symbols')

test('Should record http2 ping failures on the socket', async (t) => {
  t = tspl(t, { plan: 4 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  class FakeSocket extends EventEmitter {
    constructor () {
      super()
      this.destroyed = false
      this[kError] = null
    }

    destroy () {
      this.destroyed = true
      return this
    }

    ref () {}
    unref () {}
  }

  class FakeSession extends EventEmitter {
    constructor () {
      super()
      this.closed = false
      this.destroyed = false
    }

    close () {
      this.closed = true
    }

    destroy () {
      this.destroyed = true
    }

    ref () {}
    unref () {}

    ping (cb) {
      cb(new Error('boom'))
      this.closed = true
    }
  }

  const socket = new FakeSocket()
  const session = new FakeSession()
  let pingError = null

  const client = {
    [kHTTP2ConnectionWindowSize]: null,
    [kHTTP2InitialWindowSize]: null,
    [kMaxConcurrentStreams]: 100,
    [kOnError] (err) {
      pingError = err
    },
    [kPingInterval]: 1,
    [kSocket]: null,
    [kUrl]: new URL('https://localhost'),
    emit () {}
  }

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

  connectH2(client, socket)

  await sleep(20)

  t.ok(pingError)
  t.strictEqual(pingError.code, 'UND_ERR_INFO')
  t.strictEqual(pingError.message, 'HTTP/2: "PING" errored - type boom')
  t.strictEqual(socket[kError], pingError)

  await t.completed
})
