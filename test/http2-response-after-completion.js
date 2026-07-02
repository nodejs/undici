'use strict'

// Regression test for nodejs/undici#5440.
//
// The HTTP/2 'response' handler (onResponse in client-h2.js) only guarded
// request.aborted before calling request.onResponseStart, while its sibling
// handlers onEnd/onTrailers also guard request.completed. A 'response' frame
// delivered to a still-live stream *after* the request has completed (a
// stream-teardown race seen under load on shared h2 sessions with GOAWAY /
// refused-stream churn) therefore called onResponseStart post-completion,
// tripping its assert(!this.completed). Because that throws on the http2
// stream's event tick — outside any caller's try — it escaped as an uncaught
// exception and crashed the process.
//
// This drives the real onResponse handler (registered by connectH2) against a
// fake stream, mirroring test/http2-late-data.js, and asserts that a
// post-completion 'response' is ignored instead of asserting.

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

test('Should ignore a late http2 "response" delivered after request completion', async (t) => {
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
    emit () {},
    destroyed: false
  }

  const context = connectH2(client, new FakeSocket())

  let onResponseStartedCalls = 0
  let onResponseStartCalls = 0

  const request = new Request('https://localhost', {
    path: '/',
    method: 'GET',
    headers: {}
  }, {
    onRequestStart () {},
    onResponseStarted () {
      onResponseStartedCalls++
    },
    onResponseStart () {
      onResponseStartCalls++
    },
    onResponseData () {},
    onResponseEnd () {},
    onResponseError (_controller, err) {
      t.ifError(err)
    }
  })

  client[kQueue].push(request)

  t.ok(context.write(request))

  // Mark the request completed directly: the real completion path
  // (onRequestStreamClose) also clears the stream's request state and removes
  // its listeners, which is the opposite of the race being reproduced here —
  // a 'response' frame buffered before teardown and delivered to the still-live
  // stream *after* completion. aborted stays false so this exercises the
  // completed guard specifically, not the pre-existing aborted one.
  request.completed = true
  t.strictEqual(request.aborted, false)

  // Without the completed guard, onResponse calls request.onResponseStart,
  // whose assert(!this.completed) throws synchronously on the stream's
  // 'response' tick (an uncaught exception that crashes the process). With the
  // guard, onResponse releases the stream and returns.
  t.doesNotThrow(() => {
    stream.emit('response', { ':status': 200 })
  })

  // onResponse ran (onResponseStarted fires before the guard)...
  t.strictEqual(onResponseStartedCalls, 1)
  // ...but the guard skipped the post-completion onResponseStart...
  t.strictEqual(onResponseStartCalls, 0)
  // ...and released the stream (releaseRequestStream removes its listeners).
  t.strictEqual(stream.listenerCount('trailers'), 0)

  await t.completed
})
