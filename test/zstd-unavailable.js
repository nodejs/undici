'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const { test } = require('node:test')

// zstd support landed in Node 22.19.0/23.4.0, so `node:zlib` may not expose the
// zstd APIs on a runtime this package still supports. Loading undici must not
// depend on them; the fixture hides the APIs and then exercises an ordinary
// gzip response through the decompress interceptor.
test('undici loads and decompresses without zstd support', (t) => {
  const result = spawnSync(process.execPath, [
    join(__dirname, 'fixtures/zstd-unavailable.js')
  ], {
    timeout: 10000,
    encoding: 'utf8',
    env: { ...process.env, NODE_V8_COVERAGE: '' }
  })

  assert.ifError(result.error)
  assert.equal(result.signal, null)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), 'ok')
})
