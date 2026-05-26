'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { fetch } = require('../..')

test('fetch includes TLS certificate error details in the error message', async (t) => {
  const server = https.createServer({
    key: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'cert.pem')),
    joinDuplicateHeaders: true
  }, (req, res) => {
    res.end('ok')
  })

  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => server.close())

  await assert.rejects(
    fetch(`https://localhost:${server.address().port}`),
    (error) => {
      assert.strictEqual(error.name, 'TypeError')
      assert.match(error.message, /^fetch failed: /)
      assert.strictEqual(error.message, `fetch failed: ${error.cause.message}`)
      assert.ok([
        'DEPTH_ZERO_SELF_SIGNED_CERT',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
      ].includes(error.cause.code))
      return true
    }
  )
})
