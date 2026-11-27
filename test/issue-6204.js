'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')

const { Agent, Pool, fetch } = require('..')

// https://github.com/nodejs/undici/issues/6204
test('Agent closes unused Pool after aborted request', async (t) => {
  const server = createServer((req, res) => {
    res.end('x'.repeat(256 * 1024))
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const origin = `http://127.0.0.1:${server.address().port}`
  let pool
  const agent = new Agent({
    factory (optsOrigin, options) {
      pool = new Pool(optsOrigin, options)
      return pool
    }
  })

  t.after(async () => {
    await agent.close()
    server.closeAllConnections()
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  })

  const res = await fetch(`${origin}/`, { dispatcher: agent })
  const disconnected = once(pool, 'disconnect')
  await res.body.cancel()
  await disconnected

  await new Promise((resolve) => setTimeout(resolve, 50))

  assert.strictEqual(Object.keys(agent.stats).length, 0)
  assert.strictEqual(pool.closed, true)
})
