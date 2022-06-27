'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const { ReadableStream } = require('stream/web')
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

// https://github.com/web-platform-tests/wpt/blob/fd8aeb1bb2eb33bc43f8a5bbc682b0cff6075dfe/fetch/api/abort/general.any.js#L474-L507
test('Readable stream synchronously cancels with AbortError if aborted before reading', async (t) => {
  const server = createServer((req, res) => {
    res.write('')
    res.end()
  }).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const controller = new AbortController()
  const signal = controller.signal
  controller.abort()

  let cancelReason

  const body = new ReadableStream({
    pull (controller) {
      controller.enqueue(new Uint8Array([42]))
    },
    cancel (reason) {
      cancelReason = reason
    }
  })

  const fetchPromise = fetch(`http://localhost:${server.address().port}`, {
    body,
    signal,
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    }
  })

  t.ok(cancelReason, 'Cancel called sync')
  t.equal(cancelReason.constructor, DOMException)
  t.equal(cancelReason.name, 'AbortError')

  await t.rejects(fetchPromise, { name: 'AbortError' })

  const fetchErr = await fetchPromise.catch(e => e)

  t.equal(cancelReason, fetchErr, 'Fetch rejects with same error instance')

  t.end()
})
