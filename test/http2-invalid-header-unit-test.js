const { test } = require('node:test')
const assert = require('node:assert')
const { Client } = require('..')

test('undici should fail-fast on ERR_HTTP2_INVALID_CONNECTION_HEADERS', async (t) => {
  let retryCount = 0
  const http2 = require('node:http2')
  const pem = require('https-pem')
  const server = http2.createSecureServer(pem)
  server.on('stream', (stream) => {
    stream.respond({ ':status': 200 })
    stream.end('success')
  })
  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  const originalConnect = http2.connect
  let patchedOnce = false
  http2.connect = function (...args) {
    const session = originalConnect.apply(this, args)
    const originalRequest = session.request
    session.request = function (...reqArgs) {
      retryCount++
      if (!patchedOnce) {
        patchedOnce = true
        const error = new TypeError('HTTP/1 Connection specific headers are forbidden: "http2-settings"')
        error.code = 'ERR_HTTP2_INVALID_CONNECTION_HEADERS'
        throw error
      }
      return originalRequest.apply(this, reqArgs)
    }
    // Do not wrap destroy
    return session
  }

  const client = new Client(`https://localhost:${port}`, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })

  let errorCaught = null
  let responseReceived = false

  try {
    await client.request({
      path: '/',
      method: 'GET'
    })

    responseReceived = true
  } catch (err) {
    errorCaught = err
  } finally {
    await new Promise((resolve) => setImmediate(resolve))
    await client.close()
    await new Promise((resolve) => server.close(resolve))
    http2.connect = originalConnect
  }

  assert.strictEqual(retryCount, 1, 'Should attempt exactly once (no internal retry)')
  assert.ok(!responseReceived, 'No response should be received on fail-fast')
  assert.ok(errorCaught, 'Error should be surfaced to the caller')
  assert.strictEqual(errorCaught.code, 'UND_ERR_H2_INVALID_CONNECTION_HEADERS', 'Error should be wrapped as Undici error')
})
