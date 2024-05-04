'use strict'

const { randomFillSync } = require('node:crypto')
const { setTimeout: sleep } = require('timers/promises')
const { test } = require('node:test')
const { fetch, Agent, setGlobalDispatcher } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')

const blob = randomFillSync(new Uint8Array(1024 * 512))
const fmt = new Intl.NumberFormat()

// Enable when/if FinalizationRegistry in Node.js 18 becomes stable again
const isNode18 = process.version.startsWith('v18')

test('does not need the body to be consumed to continue', { timeout: 120_000, skip: isNode18 }, async (t) => {
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
  while (total < 10000) {
    const array = new Array(batch)
    for (let i = 0; i < batch; i++) {
      array[i] = fetch(url).catch(() => {})
    }
    await Promise.all(array)
    await sleep(delay)

    console.log(
      'RSS',
      (process.memoryUsage.rss() / 1024 / 1024) | 0,
      'MB after',
      fmt.format((total += batch)) + ' fetch() requests'
    )
  }
})
