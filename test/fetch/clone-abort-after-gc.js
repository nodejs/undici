'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Request } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

const hasGC = typeof global.gc !== 'undefined'

test('a cloned request still aborts after garbage collection', async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  // A server that never responds, so only the abort can settle the fetch.
  const server = createServer(() => {})
  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  const controller = new AbortController()
  let request = new Request(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  // The request the clone came from is now unreachable. Its controller is only held
  // weakly by the abort machinery, so collecting it used to break the chain that
  // carries the abort through to the clone.
  request = request.clone()

  setTimeout(() => {
    global.gc()
    controller.abort()
  }, 100)

  await assert.rejects(fetch(request), { name: 'AbortError' })
})

test('a chain of clones still aborts after garbage collection', async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  const server = createServer(() => {})
  t.after(closeServerAsPromise(server))
  server.listen(0)
  await once(server, 'listening')

  const controller = new AbortController()
  let request = new Request(`http://localhost:${server.address().port}`, {
    signal: controller.signal
  })

  // Every intermediate is dropped, so the whole chain has to stay reachable.
  request = request.clone()
  request = request.clone()
  request = request.clone()

  setTimeout(() => {
    global.gc()
    controller.abort()
  }, 100)

  await assert.rejects(fetch(request), { name: 'AbortError' })
})
