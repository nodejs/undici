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

test('setGlobalDispatcher mirrors a v1-compatible dispatcher that Node.js global fetch uses', () => {
  const script = `
    const { Agent, Dispatcher1Wrapper, setGlobalDispatcher } = require('./index.js')
    const http = require('node:http')
    const { once } = require('node:events')

    ;(async () => {
      const dispatcherV1Symbol = Symbol.for('undici.globalDispatcher.1')
      const dispatcherV2Symbol = Symbol.for('undici.globalDispatcher.2')
      const server = http.createServer((req, res) => res.end('ok'))
      server.listen(0)
      await once(server, 'listening')

      let count = 0
      class CountingAgent extends Agent {
        dispatch (opts, handler) {
          count++
          return super.dispatch(opts, handler)
        }
      }

      const agent = new CountingAgent()
      setGlobalDispatcher(agent)

      const dispatcherV1 = globalThis[dispatcherV1Symbol]
      if (!(dispatcherV1 instanceof Dispatcher1Wrapper)) {
        throw new Error('expected v1 global dispatcher to be a Dispatcher1Wrapper')
      }

      const url = 'http://127.0.0.1:' + server.address().port
      const res = await fetch(url)
      const body = await res.text()

      process.stdout.write(JSON.stringify({
        body,
        count,
        mirroredV2: globalThis[dispatcherV2Symbol] === agent
      }))

      server.close()
    })().catch((err) => {
      console.error(err?.cause?.stack || err?.stack || err)
      process.exit(1)
    })
  `

  const result = runNode(script)
  assert.strictEqual(result.status, 0, result.stderr)

  const payload = JSON.parse(result.stdout)
  assert.strictEqual(payload.body, 'ok')
  assert.strictEqual(payload.count, 1)
  assert.strictEqual(payload.mirroredV2, true)
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
