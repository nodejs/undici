'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http2')
const { once } = require('node:events')

const { RetryAgent, Client } = require('..')

// Regression test for https://github.com/nodejs/undici/issues/5137
// RetryAgent with a custom retry callback on an HTTP/2 connection: after a
// stream timeout (UND_ERR_INFO), calling callback(null) to retry caused
// client.request() to hang forever. The root cause was that the stream
// timeout handler double-decremented kOpenStreams (both the 'timeout' and
// 'close' paths decremented), so after the first timeout the counter went
// negative and the follow-up retry request was never dispatched.
test('RetryAgent rejects after exhausting retries on HTTP/2 stream timeout', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer()
  // The client intentionally times out and resets h2c streams in this test.
  // Swallow the expected teardown errors so node:test does not report them
  // as asynchronous activity after the assertions complete.
  server.on('error', () => {})
  server.on('session', session => {
    session.on('error', () => {})
    session.socket?.on('error', () => {})
  })

  let streamCount = 0
  let resolveStreamCount
  const streamCountReached = new Promise(resolve => {
    resolveStreamCount = resolve
  })

  server.on('stream', (stream) => {
    // Client-side stream timeouts reset these h2c streams. On some
    // platforms the expected reset can surface after the assertions finish.
    stream.on('error', () => {})
    streamCount++
    if (streamCount === 3) {
      resolveStreamCount()
    }
    // Never respond — simulates a perpetual stream timeout
  })

  after(() => new Promise(resolve => server.close(resolve)))
  await once(server.listen(0), 'listening')

  const client = new RetryAgent(
    new Client(`http://localhost:${server.address().port}`, {
      allowH2: true,
      useH2c: true,
      bodyTimeout: 50,
      headersTimeout: 50
    }),
    {
      maxRetries: 3,
      retryAfter: true,
      retry: (err, { state }, callback) => {
        // Exhaust all retries, then reject with the last error
        if (state.counter >= 3) {
          callback(err)
        } else {
          callback(null)
        }
      }
    }
  )
  after(() => client.close().catch(() => {}))

  // The request itself should reject after exhausting retries
  await t.rejects(client.request({ path: '/', method: 'GET' }), {
    code: 'UND_ERR_HEADERS_TIMEOUT',
    message: /headers timeout/
  })

  await streamCountReached

  // Verify that all 3 retries actually reached the server
  t.equal(streamCount, 3, 'server should have received all 3 request attempts')

  await t.completed
  await client.close()
})
