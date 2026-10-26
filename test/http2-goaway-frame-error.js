'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Readable } = require('node:stream')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const {
  kClient,
  kQueue,
  kPendingIdx,
  kRunningIdx,
  kSocket,
  kHTTPContext,
  kHTTP2Session,
  kHTTP2SessionState,
  kResume
} = require('../lib/core/symbols')

// Control the native event ordering explicitly: a network-only stress test can
// pass without ever flushing a queued HEADERS frame after receiving GOAWAY.
const filename = path.join(__dirname, '../lib/dispatcher/client-h2.js')
const mod = new Module(filename)
mod.filename = filename
mod.paths = Module._nodeModulePaths(path.dirname(filename))
mod._compile(fs.readFileSync(filename, 'utf8') + `
module.exports.__test = {
  onHttp2SessionGoAway, onFrameError, completeRequestStream,
  bindRequestToStream, releaseRequestStream,
  kOpenStreams, kRequestStreamState
}
`, filename)
const {
  onHttp2SessionGoAway,
  onFrameError,
  completeRequestStream,
  bindRequestToStream,
  releaseRequestStream,
  kOpenStreams,
  kRequestStreamState
} = mod.exports.__test

function fixture () {
  const errors = []
  const resumes = []
  const client = {
    [kQueue]: [],
    [kRunningIdx]: 0,
    [kPendingIdx]: 0,
    [kResume] () {
      resumes.push({ session: this[kHTTP2Session], pending: this[kPendingIdx] })
    },
    emit () {}
  }

  function session () {
    const socket = {}
    const session = {
      closed: false,
      destroyed: false,
      [kClient]: client,
      [kSocket]: socket,
      [kOpenStreams]: 0,
      [kHTTP2SessionState]: {},
      close () { this.closed = true }
    }
    client[kSocket] = socket
    client[kHTTPContext] = {}
    client[kHTTP2Session] = session
    return session
  }

  function attempt (session, id, request = { body: null, aborted: false, completed: false }) {
    const stream = new EventEmitter()
    Object.assign(stream, {
      id,
      closed: false,
      destroyed: false,
      close () { this.closed = true },
      [kHTTP2Session]: session
    })
    const state = {
      client,
      request,
      session,
      stream,
      responseReceived: false,
      requestFinalized: false,
      abort (err) {
        if (!request.aborted && !request.completed) {
          request.aborted = true
          errors.push(err)
        }
      }
    }
    stream[kRequestStreamState] = state
    session[kOpenStreams]++
    bindRequestToStream(request, stream, releaseRequestStream)
    stream.on('frameError', onFrameError)
    stream.on('close', completeRequestStream)
    if (client[kQueue][client[kPendingIdx]] !== request) {
      client[kQueue].push(request)
    }
    client[kPendingIdx]++
    return { request, stream, state }
  }

  return { client, session, attempt, errors, resumes }
}

for (const body of [null, Buffer.from('payload')]) {
  test(`replays unsent ${body === null ? 'GET' : 'buffered POST'} HEADERS after graceful GOAWAY`, () => {
    const f = fixture()
    const session = f.session()
    const request = { method: body === null ? 'GET' : 'POST', body, aborted: false, completed: false }
    const { stream, state } = f.attempt(session, 1, request)

    onHttp2SessionGoAway.call(session, 0, 2 ** 31 - 1)
    stream.emit('frameError', 1, 2)

    assert.deepEqual(f.errors, [])
    assert.deepEqual(f.client[kQueue].slice(f.client[kPendingIdx]), [request])
    assert.equal(f.client[kHTTP2Session], null)
    assert.equal(state.stream, null)
    assert.equal(state.requestFinalized, true)
    assert.equal(session[kOpenStreams], 0)
    assert.equal(stream[kRequestStreamState], null)
    assert.equal(request.body, body)

    // Native events from the abandoned attempt must not complete its retry.
    stream.emit('frameError', 1, 2)
    stream.emit('close')
    assert.deepEqual(f.client[kQueue].slice(f.client[kPendingIdx]), [request])
    assert.deepEqual(f.errors, [])
  })
}

test('does not replay unsent HEADERS more than once across sessions', () => {
  const f = fixture()
  const first = f.session()
  const { request, stream } = f.attempt(first, 1)
  onHttp2SessionGoAway.call(first, 0, 2 ** 31 - 1)
  stream.emit('frameError', 1, 2)

  const second = f.session()
  const retry = f.attempt(second, 1, request)
  onHttp2SessionGoAway.call(second, 0, 2 ** 31 - 1)
  retry.stream.emit('frameError', 1, 2)

  assert.equal(f.errors.length, 1)
  assert.equal(f.errors[0].code, 'UND_ERR_INFO')
  assert.deepEqual(f.client[kQueue].slice(f.client[kPendingIdx]), [])
})

for (const scenario of ['streaming body', 'response started', 'no GOAWAY', 'DATA frame', 'aborted', 'completed']) {
  test(`does not replay a frameError with ${scenario}`, () => {
    const f = fixture()
    const session = f.session()
    const { request, stream, state } = f.attempt(session, 1)
    if (scenario === 'streaming body') request.body = Readable.from(['payload'])
    if (scenario === 'response started') state.responseReceived = true
    if (scenario !== 'no GOAWAY') onHttp2SessionGoAway.call(session, 0, 2 ** 31 - 1)
    if (scenario === 'aborted') request.aborted = true
    if (scenario === 'completed') request.completed = true

    stream.emit('frameError', scenario === 'DATA frame' ? 0 : 1, 2)

    assert.deepEqual(f.client[kQueue].slice(f.client[kPendingIdx]), [])
    assert.equal(f.errors.length, scenario === 'aborted' || scenario === 'completed' ? 0 : 1)
    request.body?.destroy()
  })
}

for (const trigger of ['stream', 'session']) {
  test(`a synchronous sibling frameError during GOAWAY ${trigger} closure does not corrupt the queue`, () => {
    const f = fixture()
    const session = f.session()
    const accepted = f.attempt(session, 1)
    const unsent = f.attempt(session, 3)
    const refused = f.attempt(session, 5)
    const pending = { body: null }
    f.client[kQueue].push(pending)
    const target = trigger === 'stream' ? refused.stream : session
    target.close = function () {
      this.closed = true
      // Closing a refused stream or its session can synchronously flush and
      // fail the queued HEADERS of a sibling still covered by the GOAWAY.
      unsent.stream.emit('frameError', 1, 2)
    }

    onHttp2SessionGoAway.call(session, 0, 3)

    assert.deepEqual(f.errors, [])
    assert.equal(f.client[kPendingIdx], 1)
    assert.equal(f.client[kQueue].length, 4)
    assert.equal(f.client[kQueue][0], accepted.request)
    assert.equal(f.client[kQueue][1], unsent.request)
    assert.equal(f.client[kQueue][2], refused.request)
    assert.equal(f.client[kQueue][3], pending)
    assert.equal(f.resumes.every(({ session }) => session === null), true)
  })
}
