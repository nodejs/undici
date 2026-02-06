'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { EventEmitter } = require('node:events')
const connectH2 = require('../lib/dispatcher/client-h2')
const {
  kUrl,
  kSocket,
  kMaxConcurrentStreams,
  kHTTP2Session,
  kHTTP2InitialWindowSize,
  kHTTP2ConnectionWindowSize
} = require('../lib/core/symbols')

test('Should plumb initialWindowSize and connectionWindowSize into the HTTP/2 session creation path', async (t) => {
  t = tspl(t, { plan: 6 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  /** @type {any} */
  let seenConnectOptions = null
  /** @type {number[]} */
  const setLocalWindowSizeCalls = []

  class FakeSession extends EventEmitter {
    unref () {}
    ref () {}
    close () {}
    destroy () {}
    request () {
      throw new Error('not implemented')
    }

    setLocalWindowSize (size) {
      setLocalWindowSizeCalls.push(size)
    }
  }

  class FakeSocket extends EventEmitter {
    constructor () {
      super()
      this.destroyed = false
    }

    unref () {}
    ref () {}
    destroy () {
      this.destroyed = true
      return this
    }
  }

  const fakeSession = new FakeSession()

  http2.connect = function connectStub (_authority, options) {
    seenConnectOptions = options
    return fakeSession
  }

  after(() => {
    http2.connect = originalConnect
  })

  const initialWindowSize = 12345
  const connectionWindowSize = 77777

  const client = {
    [kUrl]: new URL('https://localhost'),
    [kMaxConcurrentStreams]: 100,
    [kHTTP2InitialWindowSize]: initialWindowSize,
    [kHTTP2ConnectionWindowSize]: connectionWindowSize,
    [kSocket]: null,
    [kHTTP2Session]: null
  }

  const socket = new FakeSocket()

  connectH2(client, socket)

  t.ok(seenConnectOptions && seenConnectOptions.settings)
  t.strictEqual(seenConnectOptions.settings.enablePush, false)
  t.strictEqual(
    seenConnectOptions.settings.initialWindowSize,
    initialWindowSize
  )
  t.strictEqual(client[kHTTP2Session], fakeSession)

  // Emit 'connect' event
  process.nextTick(() => {
    fakeSession.emit('connect')
  })

  await new Promise((resolve) => process.nextTick(resolve))

  t.strictEqual(setLocalWindowSizeCalls.length, 1)
  t.strictEqual(setLocalWindowSizeCalls[0], connectionWindowSize)

  await t.completed
})
