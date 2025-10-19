'use strict'

const http = require('node:http')
const { fetch } = require('../../')
const { once, setMaxListeners } = require('node:events')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')

test('long-lived-abort-controller', async (t) => {
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Hello World!')
  })

  await once(server.listen(0), 'listening')

  t.after(closeServerAsPromise(server))

  let emittedWarning = ''
  function onWarning (warning) {
    emittedWarning = warning
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
  })

  const controller = new AbortController()
  setMaxListeners(1500, controller.signal)

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

  t.assert.strictEqual(emittedWarning, '')
})
