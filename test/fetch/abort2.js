'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const { DOMException } = require('../../lib/fetch/constants')

/* global AbortController */

test('parallel fetch with the same AbortController works as expected', async (t) => {
  const body = {
    fixes: 1389,
    bug: 'Ensure request is not aborted before enqueueing bytes into stream.'
  }

  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end(JSON.stringify(body))
  })

  t.teardown(server.close.bind(server))

  const abortController = new AbortController()

  async function makeRequest () {
    const result = await fetch(`http://localhost:${server.address().port}`, {
      signal: abortController.signal
    }).then(response => response.json())

    abortController.abort()
    return result
  }

  server.listen(0)
  await once(server, 'listening')

  const requests = Array.from({ length: 10 }, makeRequest)
  const result = await Promise.allSettled(requests)

  // since the requests are running parallel, any of them could resolve first.
  // therefore we cannot rely on the order of the requests sent.
  const { resolved, rejected } = result.reduce((a, b) => {
    if (b.status === 'rejected') {
      a.rejected.push(b)
    } else {
      a.resolved.push(b)
    }

    return a
  }, { resolved: [], rejected: [] })

  t.equal(rejected.length, 9) // out of 10 requests, only 1 should succeed
  t.equal(resolved.length, 1)

  t.ok(rejected.every(rej => rej.reason?.code === DOMException.ABORT_ERR))
  t.same(resolved[0].value, body)

  t.end()
})
