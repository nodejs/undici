'use strict'

const http = require('node:http')
const { fetch } = require('../../')
const { once } = require('events')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')
const { strictEqual } = require('node:assert')

const isNode18 = process.version.startsWith('v18')

test('long-lived-abort-controller', { skip: isNode18 }, async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Hello World!')
  }).listen(0)

  await once(server, 'listening')

  t.after(closeServerAsPromise(server))

  let warningEmitted = false
  function onWarning () {
    warningEmitted = true
  }
  process.on('warning', onWarning)

  const controller = new AbortController()

  // The maxListener is set to 1500 in request.js.
  // we set it to 2000 to make sure that we are not leaking event listeners.
  // Unfortunately we are relying on GC and implementation details here.
  for (let i = 0; i < 2000; i++) {
    // make request
    const res = await fetch(`http://localhost:${server.address().port}`, {
      signal: controller.signal
    })

    // drain body
    await res.arrayBuffer()

    // wait 1 microtask
    await null
  }

  process.off('warning', onWarning)

  strictEqual(warningEmitted, false)
})
