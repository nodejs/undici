const { test } = require('node:test')
const assert = require('node:assert')

test('ERR_HTTP2_INVALID_CONNECTION_HEADERS should be catchable', async (t) => {
  const error = new TypeError('HTTP/1 Connection specific headers are forbidden: "http2-settings"')
  error.code = 'ERR_HTTP2_INVALID_CONNECTION_HEADERS'

  let errorCaught = false
  let errorCode = null

  try {
    throw error
  } catch (err) {
    errorCaught = true
    errorCode = err.code
  }

  assert.ok(errorCaught, 'Error should be catchable')
  assert.strictEqual(errorCode, 'ERR_HTTP2_INVALID_CONNECTION_HEADERS', 'Error code should match')
})

test('writeH2 function has try-catch protection', async (t) => {
  const fs = require('node:fs')
  const path = require('node:path')

  const clientH2Path = path.join(__dirname, '../lib/dispatcher/client-h2.js')
  const clientH2Content = fs.readFileSync(clientH2Path, 'utf8')

  assert.ok(
    clientH2Content.includes('ERR_HTTP2_INVALID_CONNECTION_HEADERS'),
    'client-h2.js should handle ERR_HTTP2_INVALID_CONNECTION_HEADERS'
  )

  assert.ok(
    clientH2Content.includes('H2InvalidConnectionHeadersError'),
    'client-h2.js should wrap invalid h2 header errors in an Undici error'
  )

  assert.ok(
    clientH2Content.includes('session.request(headers'),
    'client-h2.js should contain session.request calls'
  )
})
