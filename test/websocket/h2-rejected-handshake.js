'use strict'

const { test } = require('node:test')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

// An unhandled ClientHttp2Stream 'error' exits the process, so test in a child.
for (const response of ['missing-protocol', 'wrong-protocol']) {
  test(`a rejected H2 WebSocket handshake (${response}) does not crash when the session closes`, () => {
    const result = spawnSync(process.execPath, [join(__dirname, '../fixtures/websocket-h2-rejected-handshake.js'), response], {
      encoding: 'utf8',
      timeout: 10000
    })

    if (result.error) throw result.error
    const { status, signal, stderr } = result
    if (signal !== null || status !== 0) {
      throw new Error(`child exited with status ${status}, signal ${signal}: ${stderr}`)
    }
  })
}
