'use strict'

const { once } = require('node:events')
const { test, describe } = require('node:test')
const { fetch, Request } = require('../..')
const { createServer } = require('node:http')

describe('issue 4068', async () => {
  test('abort signal for new request', async (t) => {
    t.plan(2)
    const server = createServer(() => {}).listen(0)
    let aborted = false

    t.after(server.close.bind(server))

    const ac = new AbortController()
    let req = new Request(`http://localhost:${server.address().port}`, {
      signal: ac.signal
    })

    req.signal.addEventListener('abort', () => {
      aborted = true
    })

    req = new Request(req)
    setTimeout(() => {
      global.gc()
      ac.abort()
    })
    await once(server, 'listening')
    await t.assert.rejects(fetch(req))
    t.assert.ok(aborted)
  })

  test('abort signal for cloned request', async (t) => {
    t.plan(2)
    const server = createServer(() => {}).listen(0)
    let aborted = false

    t.after(server.close.bind(server))

    const ac = new AbortController()
    let req = new Request(`http://localhost:${server.address().port}`, {
      signal: ac.signal
    })

    req.signal.addEventListener('abort', () => {
      aborted = true
    })

    req = req.clone()
    setTimeout(() => {
      global.gc()
      ac.abort()
    })
    await once(server, 'listening')
    await t.assert.rejects(fetch(req))
    t.assert.ok(aborted)
  })
})
