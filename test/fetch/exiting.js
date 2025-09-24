'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')
const { once } = require('node:events')
const { createDeferredPromise } = require('../../lib/util/promise')

test('abort the request on the other side if the stream is canceled', async (t) => {
  t.plan(1)

  const promise = createDeferredPromise()

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.write('hello')
    req.on('aborted', () => {
      t.assert.ok('aborted')
      promise.resolve()
    })
    // Let's not end the response on purpose
  })
  t.after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')

  const url = new URL(`http://127.0.0.1:${server.address().port}`)

  const response = await fetch(url)

  const reader = response.body.getReader()

  try {
    await reader.read()
  } finally {
    reader.releaseLock()
    await response.body.cancel()
  }

  await promise.promise
})
