'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Blob } = require('node:buffer')
const { fetch, FormData } = require('../..')
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
