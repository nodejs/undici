'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { spawnSync } = require('node:child_process')
const { join } = require('node:path')

const cwd = join(__dirname, '../..')

function runNode (source) {
  return spawnSync(process.execPath, ['-e', source], {
    cwd,
    encoding: 'utf8'
  })
}

test('setGlobalDispatcher does not break Node.js global fetch', () => {
  const script = `
    const { Agent, setGlobalDispatcher } = require('./index.js')
    const http = require('node:http')
    const { once } = require('node:events')

    ;(async () => {
      const server = http.createServer((req, res) => res.end('ok'))
      server.listen(0)
      await once(server, 'listening')

      setGlobalDispatcher(new Agent())
      const url = 'http://127.0.0.1:' + server.address().port
      const res = await fetch(url)
      process.stdout.write(await res.text())

      server.close()
    })().catch((err) => {
      console.error(err?.cause?.stack || err?.stack || err)
      process.exit(1)
    })
  `

  const result = runNode(script)
  assert.strictEqual(result.status, 0, result.stderr)
  assert.strictEqual(result.stdout, 'ok')
})

test('Dispatcher1Wrapper bridges legacy handlers to a new Agent', () => {
  const script = `
    const { Agent, Dispatcher1Wrapper } = require('./index.js')
    const http = require('node:http')
    const { once } = require('node:events')

    ;(async () => {
      const server = http.createServer((req, res) => res.end('ok'))
      server.listen(0)
      await once(server, 'listening')

      const dispatcherV1 = Symbol.for('undici.globalDispatcher.1')
      globalThis[dispatcherV1] = new Dispatcher1Wrapper(new Agent())

      const url = 'http://127.0.0.1:' + server.address().port
      const res = await fetch(url)
      process.stdout.write(await res.text())

      server.close()
    })().catch((err) => {
      console.error(err?.cause?.stack || err?.stack || err)
      process.exit(1)
    })
  `

  const result = runNode(script)
  assert.strictEqual(result.status, 0, result.stderr)
  assert.strictEqual(result.stdout, 'ok')
})
