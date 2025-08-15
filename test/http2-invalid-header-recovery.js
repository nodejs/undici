// Test: HTTP2 invalid header handling (fail-fast)
// This test spins up an HTTP/2 TLS server and patches the client's HTTP/2 session
// to throw ERR_HTTP2_INVALID_CONNECTION_HEADERS from session.request(). Undici
// should fail-fast and wrap the error as an Undici error without internal retry.

const { test } = require('node:test')
const assert = require('node:assert')
const http2 = require('node:http2')
const { Client } = require('..')
const pem = require('https-pem')

function createServer (cb) {
  const server = http2.createSecureServer(pem)
  server.on('stream', (stream) => {
    // Normal valid response; client error should occur before this if invalid headers are sent
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })
  server.listen(0, cb)
  return server
}

test('undici should fail-fast and wrap invalid HTTP/2 connection header errors', async (t) => {
  const server = createServer(() => {})

  const address = server.address()
  const port = typeof address === 'string' ? 0 : address.port

  // Monkey-patch http2.connect to throw on request creation
  const originalConnect = http2.connect
  let thrown = false
  http2.connect = function (...args) {
    const session = originalConnect.apply(this, args)
    const originalRequest = session.request
    session.request = function (...rargs) {
      if (!thrown) {
        thrown = true
        const e = new TypeError('HTTP/1 Connection specific headers are forbidden: "http2-settings"')
        e.code = 'ERR_HTTP2_INVALID_CONNECTION_HEADERS'
        throw e
      }
      return originalRequest.apply(this, rargs)
    }
    return session
  }

  const client = new Client(`https://localhost:${port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  let errorCaught = null

  try {
    await client.request({
      path: '/',
      method: 'GET'
    })
  } catch (err) {
    errorCaught = err
  } finally {
    await client.close()
    await new Promise((resolve) => server.close(resolve))
    http2.connect = originalConnect
  }

  assert.ok(errorCaught, 'Request should surface an error')
  assert.strictEqual(errorCaught.code, 'UND_ERR_H2_INVALID_CONNECTION_HEADERS', 'Error code should indicate invalid HTTP/2 connection headers')
})
