'use strict'

const { randomFillSync } = require('node:crypto')
const { setTimeout: sleep } = require('timers/promises')
const { test } = require('node:test')
const { fetch, Agent, setGlobalDispatcher } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')

const blob = randomFillSync(new Uint8Array(1024 * 512))

// Enable when/if FinalizationRegistry in Node.js 18 becomes stable again
const isNode18 = process.version.startsWith('v18')
const hasGC = typeof global.gc !== 'undefined'

test('does not need the body to be consumed to continue', { timeout: 180_000, skip: isNode18 }, async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }
  const agent = new Agent({
    keepAliveMaxTimeout: 10,
    keepAliveTimeoutThreshold: 10
  })
  setGlobalDispatcher(agent)
  const server = createServer((req, res) => {
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
