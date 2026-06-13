'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http2')

const { Client } = require('..')
const { kQueue } = require('../lib/core/symbols')

// Regression test for https://github.com/nodejs/undici/issues/5404.
// HTTP/2 streams can complete out of order. Completing the second stream first
// must not clear the first request's queue slot; otherwise destroying the
// client can lose or mis-error the still-running request.
test('h2: out-of-order completion preserves running requests during destroy', async () => {
  const server = createServer()
  let firstStream

  server.on('sessionError', () => {})
  server.on('stream', (stream, headers) => {
    switch (headers[':path']) {
      case '/first':
        firstStream = stream
        break
      case '/second':
        stream.respond({ ':status': 200 })
        stream.end('second')
        break
      case '/third':
        stream.respond({ ':status': 200 })
        stream.end('third')
        break
      default:
        stream.respond({ ':status': 404 })
        stream.end()
    }
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    allowH2: true,
    useH2c: true,
    maxConcurrentStreams: 2
  })

  try {
    const first = client.request({ path: '/first', method: 'GET' })
    const firstError = first.then(
      () => null,
      err => err
    )

    const second = await client.request({ path: '/second', method: 'GET' })
    assert.strictEqual(await second.body.text(), 'second')

    const third = await client.request({ path: '/third', method: 'GET' })
    assert.strictEqual(await third.body.text(), 'third')

    assert.strictEqual(firstStream.destroyed, false)
    assert.deepStrictEqual(client[kQueue].map(request => request?.path), ['/first'])

    await client.destroy(new Error('boom'))
    assert.strictEqual((await firstError).message, 'boom')
  } finally {
    await client.destroy().catch(() => {})
    server.close()
  }
})
