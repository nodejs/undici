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
  kPingInterval,
  kHTTP2Options
} = require('../lib/core/symbols')

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

test('Should ignore late http2 data after request completion', async (t) => {
  t = tspl(t, { plan: 6 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

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
    [kHTTP2Options]: {
      pingInterval: 60e3,
      connectionWindowSize: 524288,
      maxConcurrentStreams: 100,
      sessionOptions: {
        initialWindowSize: 262144
      }
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
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {
      onDataCalls++
    },
    onResponseEnd (_controller, trailers) {
      onCompleteCalls++
      t.strictEqual(trailers['x-trailer'], 'hello')
    },
    onResponseError (_controller, err) {
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

  // Completion is deferred to onRequestStreamClose (fires on 'close')
  stream.emit('close')

  t.strictEqual(onCompleteCalls, 1)
  t.strictEqual(onDataCalls, 0)
  t.ok(resumeCalls >= 1)

  await t.completed
})

test('Should complete the response and release the stream on end without a close event', async (t) => {
  // Repro for the completion-path leak: on a busy, long-lived multiplexed
  // session the native 'close' event can fail to fire. Cleanup (finalize,
  // listener removal, session stream-count decrement) is gated on 'close', so
  // completed-but-not-closed streams pin their request graph and buffers until
  // OOM. This drives a normal completion through 'end' and never emits 'close'.
  t = tspl(t, { plan: 7 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  const stream = new FakeStream()
  const session = new FakeSession(stream)

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

  let onCompleteCalls = 0
  let endTrailers = null

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
    [kResume] () {},
    [kHTTP2Options]: {
      pingInterval: 60e3,
      connectionWindowSize: 524288,
      maxConcurrentStreams: 100,
      sessionOptions: {
        initialWindowSize: 262144
      }
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
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd (_controller, trailers) {
      onCompleteCalls++
      endTrailers = trailers
    },
    onResponseError (_controller, err) {
      t.ifError(err)
    }
  })

  client[kQueue].push(request)

  t.ok(context.write(request))
  t.equal(stream.listenerCount('trailers'), 1)

  stream.emit('response', { ':status': 200 })
  stream.emit('trailers', { 'x-trailer': 'hello' })
  stream.emit('data', Buffer.from('body'))
  stream.emit('end')
  // Intentionally no stream.emit('close').

  t.strictEqual(onCompleteCalls, 1)
  t.strictEqual(endTrailers?.['x-trailer'], 'hello')
  t.equal(stream.listenerCount('trailers'), 0)
  t.equal(stream.listenerCount('aborted'), 0)
  t.equal(stream.listenerCount('timeout'), 0)

  await t.completed
})

test('Should complete only once when both end and a late close fire', async (t) => {
  // Guards the idempotency of completing on 'end': when 'close' still arrives
  // afterwards, onRequestStreamClose must be a no-op -- no second onResponseEnd
  // and no double session open-stream decrement.
  t = tspl(t, { plan: 4 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  const stream = new FakeStream()
  const session = new FakeSession(stream)

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

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
    [kResume] () {},
    [kHTTP2Options]: {
      pingInterval: 60e3,
      connectionWindowSize: 524288,
      maxConcurrentStreams: 100,
      sessionOptions: {
        initialWindowSize: 262144
      }
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
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd () {
      onCompleteCalls++
    },
    onResponseError (_controller, err) {
      t.ifError(err)
    }
  })

  client[kQueue].push(request)

  t.ok(context.write(request))

  stream.emit('response', { ':status': 200 })
  stream.emit('end')
  t.strictEqual(onCompleteCalls, 1)

  // A late 'close' must not complete the request a second time.
  t.doesNotThrow(() => {
    stream.emit('close')
  })
  t.strictEqual(onCompleteCalls, 1)

  await t.completed
})

test('Should remove request-owned http2 stream listeners after completion', async (t) => {
  t = tspl(t, { plan: 7 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  const stream = new FakeStream()
  const session = new FakeSession(stream)

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

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
    [kHTTP2Options]: {
      pingInterval: 60e3,
      connectionWindowSize: 524288,
      maxConcurrentStreams: 100,
      sessionOptions: {
        initialWindowSize: 262144
      }
    },
    [kResume] () {},
    emit () {},
    destroyed: false
  }

  const context = connectH2(client, new FakeSocket())

  const request = new Request('https://localhost', {
    path: '/',
    method: 'GET',
    headers: {}
  }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd () {},
    onResponseError (_controller, err) {
      t.ifError(err)
    }
  })

  client[kQueue].push(request)

  t.ok(context.write(request))
  t.equal(stream.listenerCount('aborted'), 1)
  t.equal(stream.listenerCount('timeout'), 1)
  t.equal(stream.listenerCount('trailers'), 1)

  stream.emit('response', { ':status': 200 })
  stream.emit('end')

  // When trailers are not expected, completion is deferred to
  // onRequestStreamClose, which fires on the 'close' event.
  stream.emit('close')

  t.equal(stream.listenerCount('aborted'), 0)
  t.equal(stream.listenerCount('timeout'), 0)
  t.equal(stream.listenerCount('trailers'), 0)

  await t.completed
})

test('Should finalize an already-aborted request when its stream closes', async (t) => {
  t = tspl(t, { plan: 4 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  const stream = new FakeStream()
  const session = new FakeSession(stream)

  http2.connect = function connectStub () {
    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

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
    [kResume] () {},
    [kHTTP2Options]: {
      pingInterval: 60e3,
      connectionWindowSize: 524288,
      maxConcurrentStreams: 100,
      sessionOptions: {
        initialWindowSize: 262144
      }
    },
    emit () {},
    destroyed: false
  }

  const context = connectH2(client, new FakeSocket())
  const expectedError = new Error('aborted')
  let onCompleteCalls = 0

  const request = new Request('https://localhost', {
    path: '/',
    method: 'GET',
    headers: {}
  }, {
    onRequestStart () {},
    onResponseStart () {},
    onResponseData () {},
    onResponseEnd () {
      onCompleteCalls++
    },
    onResponseError (_controller, err) {
      t.strictEqual(err, expectedError)
    }
  })

  client[kQueue].push(request)
  client[kPendingIdx] = 1

  t.ok(context.write(request))
  request.onResponseError(expectedError)
  stream.emit('close')

  t.strictEqual(onCompleteCalls, 0)
  t.strictEqual(client[kQueue][0], null)

  await t.completed
})
