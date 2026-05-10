'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

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

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  let streamCount = 0
  let resolveStreamCount
  const streamCountReached = new Promise(resolve => {
    resolveStreamCount = resolve
  })

  server.on('stream', (stream) => {
    streamCount++
    if (streamCount === 3) {
      resolveStreamCount()
    }
    // Never respond — simulates a perpetual stream timeout
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new RetryAgent(
    new Client(`https://localhost:${server.address().port}`, {
      connect: { rejectUnauthorized: false },
      allowH2: true,
      bodyTimeout: 50
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
  after(() => client.close())

  // The request itself should reject after exhausting retries
  await t.rejects(client.request({ path: '/', method: 'GET' }), {
    code: 'UND_ERR_INFO',
    message: /stream timeout/
  })

  await streamCountReached

  // Verify that all 3 retries actually reached the server
  t.equal(streamCount, 3, 'server should have received all 3 request attempts')

  await t.completed
})
