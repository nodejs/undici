'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { fetch, FormData, Agent } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/1783
test('Content-Length is set when using a FormData body with fetch', async (t) => {
  const server = createServer((req, res) => {
    // TODO: check the length's value once the boundary has a fixed length
    assert.ok('content-length' in req.headers) // request has content-length header
    assert.ok(!Number.isNaN(Number(req.headers['content-length'])))
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(closeServerAsPromise(server))

  const fd = new FormData()
  fd.set('file', new Blob(['hello world 👋'], { type: 'text/plain' }), 'readme.md')
  fd.set('string', 'some string value')

  await fetch(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body: fd
  })
})

test('Content-Length is not duplicated when provided explicitly', async (t) => {
  const body = 'a+b+c'

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    assert.strictEqual(req.headers['content-length'], `${Buffer.byteLength(body)}`)
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.after(closeServerAsPromise(server))

  // undici 6's own core tolerates "5, 5" via parseInt, but newer cores (and
  // Node's bundled undici >= 7.28 reached through the shared global dispatcher)
  // reject it, so assert on the exact value fetch hands to the dispatcher.
  const dispatchedContentLengths = []
  class RecordingAgent extends Agent {
    dispatch (opts, handler) {
      dispatchedContentLengths.push(opts.headers['content-length'])
      return super.dispatch(opts, handler)
    }
  }
  const dispatcher = new RecordingAgent()
  t.after(() => dispatcher.close())

  await fetch(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body,
    headers: {
      'content-length': Buffer.byteLength(body)
    },
    dispatcher
  })

  assert.deepStrictEqual(dispatchedContentLengths, [`${Buffer.byteLength(body)}`])
})
