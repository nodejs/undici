'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { PassThrough } = require('node:stream')

const {
  kClient,
  kPendingIdx,
  kRunningIdx,
  kQueue,
  kSocket,
  kHTTPContext,
  kHTTP2Session,
  kResume
} = require('../lib/core/symbols')

function loadClientH2Internals () {
  const filename = path.join(__dirname, '../lib/dispatcher/client-h2.js')
  const source = fs.readFileSync(filename, 'utf8') + `
module.exports.__test = {
  onHttp2SessionGoAway,
  kReceivedGoAway,
  kRequestStream,
  kRequestStreamId,
  kRequestStreamCleanup
}
`

  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports.__test
}

test('h2: GOAWAY resets unaccepted streams and only requeues replayable requests', () => {
  const {
    onHttp2SessionGoAway,
    kReceivedGoAway,
    kRequestStream,
    kRequestStreamId,
    kRequestStreamCleanup
  } = loadClientH2Internals()

  const disconnects = []
  let resumed = 0

  const client = {
    [kRunningIdx]: 0,
    [kPendingIdx]: 3,
    [kQueue]: [],
    [kSocket]: { marker: 'socket' },
    [kHTTPContext]: { marker: 'context' },
    [kHTTP2Session]: null,
    [kResume]: () => { resumed++ },
    emit: (...args) => disconnects.push(args)
  }

  const acceptedRequest = {
    [kRequestStreamId]: 1
  }

  const replayableStream = {
    destroyed: false,
    closed: false,
    closeCode: null,
    close (code) {
      this.closeCode = code
      this.closed = true
    }
  }

  const replayableRequest = {
    body: Buffer.from('payload'),
    aborted: false,
    completed: false,
    [kRequestStreamId]: 3,
    [kRequestStream]: replayableStream,
    [kRequestStreamCleanup]: () => {
      replayableRequest.cleanupCalled = true
    }
  }

  const streamingBody = new PassThrough()
  const streamingStream = {
    destroyed: false,
    closed: false,
    closeCode: null,
    close (code) {
      this.closeCode = code
      this.closed = true
    }
  }

  const streamingRequest = {
    body: streamingBody,
    aborted: false,
    completed: false,
    error: null,
    [kRequestStreamId]: 5,
    [kRequestStream]: streamingStream,
    [kRequestStreamCleanup]: () => {
      streamingRequest.cleanupCalled = true
    },
    onResponseError (err) {
      this.aborted = true
      this.error = err
    }
  }

  const pendingRequest = {
    pending: true
  }

  client[kQueue] = [acceptedRequest, replayableRequest, streamingRequest, pendingRequest]

  const session = {
    closed: false,
    destroyed: false,
    [kClient]: client,
    [kSocket]: client[kSocket],
    [kReceivedGoAway]: false,
    close () {
      this.closed = true
    }
  }

  client[kHTTP2Session] = session

  onHttp2SessionGoAway.call(session, 0, 1)

  assert.strictEqual(replayableStream.closeCode, 7)
  assert.strictEqual(streamingStream.closeCode, 7)
  assert.strictEqual(replayableRequest.cleanupCalled, true)
  assert.strictEqual(streamingRequest.cleanupCalled, true)

  assert.strictEqual(replayableRequest[kRequestStream], null)
  assert.strictEqual(replayableRequest[kRequestStreamId], null)
  assert.strictEqual(replayableRequest[kRequestStreamCleanup], null)

  assert.strictEqual(streamingRequest[kRequestStream], null)
  assert.strictEqual(streamingRequest[kRequestStreamId], null)
  assert.strictEqual(streamingRequest[kRequestStreamCleanup], null)
  assert.strictEqual(streamingRequest.aborted, true)
  assert.strictEqual(streamingRequest.error.message, 'HTTP/2: "GOAWAY" frame received with code 0')

  assert.deepStrictEqual(client[kQueue], [acceptedRequest, replayableRequest, pendingRequest])
  assert.strictEqual(client[kPendingIdx], 1)
  assert.strictEqual(client[kSocket], null)
  assert.strictEqual(client[kHTTPContext], null)
  assert.strictEqual(client[kHTTP2Session], null)
  assert.strictEqual(session.closed, true)
  assert.strictEqual(resumed, 1)
  assert.strictEqual(disconnects.length, 1)
})
