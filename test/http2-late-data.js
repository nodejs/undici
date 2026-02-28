'use strict'

const { test, after } = require('node:test')
const { EventEmitter } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')

const connectH2 = require('../lib/dispatcher/client-h2')
const Request = require('../lib/core/request')
const {
  kUrl,
  kSocket,
  kMaxConcurrentStreams,
  kHTTP2InitialWindowSize,
  kHTTP2ConnectionWindowSize,
  kBodyTimeout,
  kStrictContentLength,
  kQueue,
  kRunningIdx,
  kPendingIdx,
  kOnError,
  kResume,
  kRunning,
  kPingInterval
} = require('../lib/core/symbols')

test('Should ignore late http2 data after request completion', async (t) => {
  t = tspl(t, { plan: 6 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  class FakeSocket extends EventEmitter {
    constructor () {
      super()
      this.destroyed = false
    }

    destroy () {
      this.destroyed = true
      return this
    }

    ref () {}
    unref () {}
  }

  class FakeStream extends EventEmitter {
    setTimeout () {}
    pause () {}
    resume () {}
    close () {}
    write () { return true }
    end () {}
    cork () {}
    uncork () {}
  }

  class FakeSession extends EventEmitter {
    constructor (stream) {
      super()
      this.stream = stream
      this.closed = false
      this.destroyed = false
    }

    request () {
      return this.stream
    }

    close () {
      this.closed = true
    }

    destroy () {
      this.destroyed = true
    }

    ref () {}
    unref () {}
    ping (_, cb) {
      cb(null, 0)
    }
  }

  const stream = new FakeStream()
  const session = new FakeSession(stream)

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

  let resumeCalls = 0
  let onDataCalls = 0
  let onCompleteCalls = 0

  const client = {
    [kUrl]: new URL('https://localhost'),
    [kSocket]: null,
    [kMaxConcurrentStreams]: 100,
    [kHTTP2InitialWindowSize]: null,
    [kHTTP2ConnectionWindowSize]: null,
    [kBodyTimeout]: 30_000,
    [kStrictContentLength]: true,
    [kQueue]: [],
    [kRunningIdx]: 0,
    [kPendingIdx]: 0,
    [kRunning]: 1,
    [kPingInterval]: 0,
    [kOnError] (err) {
      t.ifError(err)
    },
    [kResume] () {
      resumeCalls++
    },
    emit () {},
    destroyed: false
  }

  const context = connectH2(client, new FakeSocket())

  const request = new Request('https://localhost', {
    path: '/',
    method: 'GET',
    headers: {}
  }, {
    onConnect () {},
    onHeaders () {
      return true
    },
    onData () {
      onDataCalls++
      return true
    },
    onComplete (trailers) {
      onCompleteCalls++
      t.strictEqual(trailers['x-trailer'], 'hello')
    },
    onError (err) {
      t.ifError(err)
    }
  })

  client[kQueue].push(request)

  t.ok(context.write(request))

  stream.emit('response', { ':status': 200 })
  stream.emit('trailers', { 'x-trailer': 'hello' })

  t.doesNotThrow(() => {
    stream.emit('data', Buffer.from('late-data'))
  })

  stream.emit('end')

  t.strictEqual(onCompleteCalls, 1)
  t.strictEqual(onDataCalls, 0)
  t.ok(resumeCalls >= 1)

  await t.completed
})
