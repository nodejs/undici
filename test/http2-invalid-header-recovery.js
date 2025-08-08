// Test: HTTP2 invalid header recovery
// This test spins up an HTTP2 server that sends an invalid HTTP/1 header in the response.
// Undici client should recover and retry the request instead of crashing.

const { test } = require('node:test')
const assert = require('node:assert')
const http2 = require('node:http2')
const { Client } = require('..')
const pem = require('https-pem')

const PORT = 5678

function createInvalidHeaderServer (cb) {
  const server = http2.createSecureServer(pem)
  let callCount = 0
  server.on('stream', (stream, headers) => {
    console.log('[SERVER] Received stream, callCount:', callCount + 1)
    callCount++
    if (callCount === 1) {
      // First request: send invalid HTTP/1 header in HTTP2 response
      console.log('[SERVER] Sending invalid header response')
      stream.respond({
        ':status': 200,
        'http2-settings': 'invalid' // forbidden in HTTP2
      })
      stream.end('hello')
    } else {
      // Second request (retry): send valid response
      console.log('[SERVER] Sending valid response')
      stream.respond({
        ':status': 200
      })
      stream.end('world')
    }
  })
  server.listen(PORT, cb)
  return server
}

test('undici should recover from invalid HTTP2 headers', async (t) => {
  const server = createInvalidHeaderServer(() => {
    // console.log('Server listening');
  })

  const client = new Client(`https://localhost:${PORT}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  let errorCaught = false
  let responseText = ''

  try {
    await new Promise((resolve, reject) => {
      client.request({
        path: '/',
        method: 'GET'
      })
        .then(async (res) => {
          for await (const chunk of res.body) {
            responseText += chunk
          }
          console.log('[CLIENT] Received response:', responseText)
          resolve()
        })
        .catch((err) => {
          errorCaught = true
          console.log('[CLIENT] Caught error:', err)
          resolve()
        })
    })
  } finally {
    client.close()
    server.close()
  }

  // The client should not crash, and should either retry or surface a handled error
  assert.ok(!errorCaught, 'Request should not crash the process')
  assert.strictEqual(responseText, 'world', 'Retry should succeed and receive valid response body')
})
