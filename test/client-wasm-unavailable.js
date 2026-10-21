'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')
const { test } = require('node:test')

// Each process starts with an empty parser cache and must exit without open sockets.
for (const mode of ['deleted', 'undefined', 'jitless', 'normal', 'no-simd', 'fallback', 'milo', 'milo-unavailable']) {
  test(`HTTP/1 WebAssembly support: ${mode}`, (t) => {
    const args = mode === 'jitless' ? ['--jitless'] : []
    const result = spawnSync(process.execPath, [
      ...args,
      join(__dirname, 'fixtures/wasm-support.js'),
      mode
    ], {
      env: { ...process.env, UNDICI_NO_WASM_SIMD: '0', UNDICI_USE_MILO: '0' },
      timeout: 10000,
      encoding: 'utf8'
    })

    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.signal, null)
    if (result.stdout.trim() === 'WebAssembly available under --jitless') {
      t.skip('--jitless does not disable WebAssembly in this runtime')
      return
    }
    assert.equal(result.stdout.trim(), 'ok')
  })
}
