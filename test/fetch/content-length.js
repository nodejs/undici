'use strict'

const { test } = require('tap')
const { Blob } = require('buffer')
const { FormData, fetch } = require('../..')
const { once } = require('events')
const { createServer } = require('http')

const isV16x = process.version.startsWith('v16.')

// https://github.com/nodejs/undici/issues/1783
test('Sending a FormData body sets Content-Length header', { skip: isV16x }, async (t) => {
  const server = createServer((req, res) => {
    t.equal(req.headers['content-length'], '285')
    res.end()
  }).listen(0)

  await once(server, 'listening')
  t.teardown(server.close.bind(server))

  const blob = new Blob(['body'], { type: 'text/plain' })

  const fd = new FormData()
  fd.append('file', blob)
  fd.append('string', 'string value')

  await fetch(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body: fd
  })
})
