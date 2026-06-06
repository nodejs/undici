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

test('setGlobalDispatcher mirrors the dispatcher under the v1 symbol that Node.js global fetch uses', () => {
  const script = `
    const { Agent, setGlobalDispatcher } = require('./index.js')
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

      const url = 'http://127.0.0.1:' + server.address().port
      const res = await fetch(url)
      const body = await res.text()

      process.stdout.write(JSON.stringify({
        body,
        count,
        mirroredV1: globalThis[dispatcherV1Symbol] === agent,
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
  assert.strictEqual(payload.mirroredV1, true)
  assert.strictEqual(payload.mirroredV2, true)
})

test('undici fetch always uses the v1 global dispatcher', () => {
  const script = `
    const assert = require('node:assert')
    const { createServer } = require('node:http')
    const { once } = require('node:events')
    const Agent = require('./lib/dispatcher/agent')

    ;(async () => {
      const dispatcherV1Symbol = Symbol.for('undici.globalDispatcher.1')
      const dispatcherV2Symbol = Symbol.for('undici.globalDispatcher.2')
      const agent = new Agent()
      let v1Dispatches = 0
      let v2Dispatches = 0

      const v2Dispatcher = {
        dispatch () {
          v2Dispatches++
          throw new Error('v2 global dispatcher should not be used')
        }
      }

      const v1Dispatcher = {
        dispatch (opts, handler) {
          v1Dispatches++
          return agent.dispatch(opts, handler)
        },
        close: (...args) => agent.close(...args),
        destroy: (...args) => agent.destroy(...args)
      }

      Object.defineProperty(globalThis, dispatcherV2Symbol, {
        value: v2Dispatcher,
        writable: true,
        enumerable: false,
        configurable: false
      })
      Object.defineProperty(globalThis, dispatcherV1Symbol, {
        value: v1Dispatcher,
        writable: true,
        enumerable: false,
        configurable: false
      })

      const { fetch, getGlobalDispatcher } = require('./index.js')
      const server = createServer((_request, response) => response.end('ok'))
      server.listen(0, '127.0.0.1')
      await once(server, 'listening')

      const response = await fetch('http://127.0.0.1:' + server.address().port)
      const body = await response.text()

      assert.strictEqual(body, 'ok')
      assert.strictEqual(getGlobalDispatcher(), v1Dispatcher)
      assert.strictEqual(v1Dispatches, 1)
      assert.strictEqual(v2Dispatches, 0)

      server.close()
      await once(server, 'close')
      await agent.close()
    })().catch((err) => {
      console.error(err?.cause?.stack || err?.stack || err)
      process.exit(1)
    })
  `

  const result = runNode(script)
  assert.strictEqual(result.status, 0, result.stderr)
})

test('Node.js global fetch preserves headers and decoding with an undici Agent dispatcher', () => {
  const script = `
    const assert = require('node:assert')
    const { createServer } = require('node:http')
    const { once } = require('node:events')
    const { brotliCompressSync } = require('node:zlib')
    const { Agent } = require('./index.js')

    ;(async () => {
      const body = Buffer.from('body content')
      const compressedBody = brotliCompressSync(body)
      const server = createServer((_request, response) => {
        response.writeHead(200, {
          'content-type': 'application/x-ndjson',
          'content-encoding': 'br',
          'another-test-header': 'test-value'
        })
        response.end(compressedBody)
      })
      server.listen(0)
      await once(server, 'listening')

      const url = 'http://127.0.0.1:' + server.address().port
      const cases = [
        ['global dispatcher', {}],
        ['custom dispatcher', { dispatcher: new Agent() }]
      ]

      for (const [label, init] of cases) {
        const response = await fetch(url, init)
        const responseBody = Buffer.from(await response.arrayBuffer()).toString('utf8')

        assert.strictEqual(response.headers.get('content-type'), 'application/x-ndjson', label)
        assert.strictEqual(response.headers.get('content-encoding'), 'br', label)
        assert.strictEqual(response.headers.get('another-test-header'), 'test-value', label)
        assert.strictEqual(responseBody, 'body content', label)
      }

      server.close()
    })().catch((err) => {
      console.error(err?.cause?.stack || err?.stack || err)
      process.exit(1)
    })
  `

  const result = runNode(script)
  assert.strictEqual(result.status, 0, result.stderr)
})
