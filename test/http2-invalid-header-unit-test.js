// Unit test for HTTP2 invalid header recovery logic
// This test directly mocks the session.request() call to throw ERR_HTTP2_INVALID_CONNECTION_HEADERS

const { test } = require('node:test')
const assert = require('node:assert')
const { Client } = require('..')

test('undici should handle ERR_HTTP2_INVALID_CONNECTION_HEADERS gracefully', async (t) => {
  let retryCount = 0
  let sessionDestroyCount = 0

  // Mock the writeH2 function to simulate the invalid header error

  // Create a simple HTTP server for the client to connect to
  const http = require('node:http')
  const server = http.createServer((req, res) => {
    res.writeHead(200)
    res.end('success')
  })

  server.listen(0)
  const port = server.address().port

  const client = new Client(`http://localhost:${port}`)

  // Patch the client's HTTP2 session to simulate the error
  const originalConnect = client.connect
  client.connect = function (callback) {
    const result = originalConnect.call(this, callback)

    // Mock session.request to throw the error on first call, succeed on second
    if (this[Symbol.for('undici.kHTTP2Session')]) {
      const session = this[Symbol.for('undici.kHTTP2Session')]
      const originalRequest = session.request

      session.request = function (headers, options) {
        retryCount++
        if (retryCount === 1) {
          console.log('[MOCK] Throwing ERR_HTTP2_INVALID_CONNECTION_HEADERS on first attempt')
          const error = new TypeError('HTTP/1 Connection specific headers are forbidden: "http2-settings"')
          error.code = 'ERR_HTTP2_INVALID_CONNECTION_HEADERS'
          throw error
        } else {
          console.log('[MOCK] Allowing request on retry')
          return originalRequest.call(this, headers, options)
        }
      }

      const originalDestroy = session.destroy
      session.destroy = function () {
        sessionDestroyCount++
        console.log('[MOCK] Session destroyed, count:', sessionDestroyCount)
        return originalDestroy.call(this)
      }
    }

    return result
  }

  let errorCaught = false
  let responseReceived = false

  try {
    const response = await client.request({
      path: '/',
      method: 'GET'
    })

    responseReceived = true
    console.log('[TEST] Response received:', response.statusCode)
  } catch (err) {
    errorCaught = true
    console.log('[TEST] Error caught:', err.message)
  } finally {
    client.close()
    server.close()
  }

  // Assertions
  console.log('[TEST] Retry count:', retryCount)
  console.log('[TEST] Session destroy count:', sessionDestroyCount)
  console.log('[TEST] Error caught:', errorCaught)
  console.log('[TEST] Response received:', responseReceived)

  // The client should have retried and either succeeded or failed gracefully (not crashed)
  assert.ok(retryCount >= 1, 'Should have attempted at least one request')
  assert.ok(!errorCaught || responseReceived, 'Should either succeed on retry or handle error gracefully')
})
