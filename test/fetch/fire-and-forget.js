'use strict'

const { randomFillSync } = require('node:crypto')
const { setTimeout: sleep } = require('node:timers/promises')
const { test } = require('node:test')
const { fetch, Request, Agent, setGlobalDispatcher } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')
const assert = require('node:assert')

const blob = randomFillSync(new Uint8Array(1024 * 512))

const hasGC = typeof global.gc !== 'undefined'

// https://github.com/nodejs/undici/issues/4150
test('test finalizer cloned request', async () => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  const request = new Request('http://localhost', { method: 'POST', body: 'Hello' })

  for (let i = 0; i < 800; ++i) request.clone()

  await sleep(50)

  // eslint-disable-next-line no-undef
  gc(true)

  assert.strictEqual(request.bodyUsed, false)
})

test('does not need the body to be consumed to continue', { timeout: 180_000 }, async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }
  const agent = new Agent({
    keepAliveMaxTimeout: 10,
    keepAliveTimeoutThreshold: 10
  })
  setGlobalDispatcher(agent)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end(blob)
  })
  t.after(closeServerAsPromise(server))

  await new Promise((resolve) => {
    server.listen(0, resolve)
  })

  const url = new URL(`http://127.0.0.1:${server.address().port}`)

  const batch = 50
  const delay = 0
  let total = 0
  while (total < 5000) {
    // eslint-disable-next-line no-undef
    gc(true)
    const array = new Array(batch)
    for (let i = 0; i < batch; i += 2) {
      array[i] = fetch(url).catch(() => {})
      array[i + 1] = fetch(url).then(r => r.clone()).catch(() => {})
    }
    await Promise.all(array)
    await sleep(delay)

    console.log(
      'RSS',
      (process.memoryUsage.rss() / 1024 / 1024) | 0,
      'MB after',
      (total += batch) + ' fetch() requests'
    )
  }
})
