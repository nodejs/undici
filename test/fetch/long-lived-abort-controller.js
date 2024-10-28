'use strict'

const http = require('node:http')
const { fetch } = require('../../')
const { once } = require('events')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')
const { strictEqual } = require('node:assert')
const util = require('../../lib/core/util')

// https://github.com/nodejs/node/commit/d4736060404726a24d4e52647b8c9b88914b8ddf
const isFixedOrderAbortSignalAny = typeof AbortSignal.any === 'function' && util.nodeMajor >= 23

const isNode18 = process.version.startsWith('v18')

// TODO: Drop support below node v23, then delete this.
test('long-lived-abort-controller', { skip: isNode18 || isFixedOrderAbortSignalAny }, async (t) => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.write('Hello World!')
    res.end()
  }).listen(0)

  await once(server, 'listening')

  t.after(closeServerAsPromise(server))

  let warningEmitted = false
  function onWarning () {
    warningEmitted = true
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
  })

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
    await res.text()
  }

  strictEqual(warningEmitted, false)
})
