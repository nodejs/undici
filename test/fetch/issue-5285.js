'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { once, getEventListeners } = require('node:events')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/5285
// Reusing a single AbortSignal across many fetch() calls must not leak
// `abort` listeners on the signal, which previously caused Node.js to emit
// a MaxListenersExceededWarning.
test('fetch removes the abort listener once the request settles', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  })

  t.after(closeServerAsPromise(server))
  await once(server.listen(0), 'listening')

  let warning = null
  function onWarning (value) {
    warning = value
  }
  process.on('warning', onWarning)
  t.after(() => process.off('warning', onWarning))

  const controller = new AbortController()
  const { signal } = controller

  const url = `http://localhost:${server.address().port}`

  // Issue many more requests than the default max listeners (10) while
  // sharing the same signal. Each settled request must remove its listener,
  // otherwise a MaxListenersExceededWarning is emitted and the listeners leak.
  for (let i = 0; i < 100; i++) {
    const res = await fetch(url, { signal })
    await res.text()
  }

  // Allow the trailing end-of-body cleanup of the final request, which is
  // scheduled in a microtask, to run before asserting.
  await new Promise((resolve) => setTimeout(resolve, 100))

  // No `abort` listeners should remain registered on the signal once every
  // request has settled.
  assert.strictEqual(getEventListeners(signal, 'abort').length, 0)
  assert.strictEqual(warning, null)
})
