'use strict'

// nodejs/undici#6054 —— 报告者复现（已验证在当前 main 上 FAIL：Pool 永久卡死）
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { setImmediate: nextTurn } = require('node:timers/promises')
const { Pool } = require('../index.js')

test('Pool remains usable after a request validation error', { timeout: 5000 }, async (t) => {
  let received = 0
  const server = createServer((req, res) => {
    received++
    res.end('ok')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const pool = new Pool(`http://127.0.0.1:${server.address().port}`, { connections: 1 })
  t.after(async () => {
    await pool.destroy()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })

  const warm = await pool.request({ path: '/', method: 'GET' })
  assert.equal(await warm.body.text(), 'ok')
  await nextTurn()
  assert.equal(pool.stats.free, 1)

  await assert.rejects(
    pool.request({ path: '/', method: 'GET', headers: { 'x-invalid': '\n' } }),
    { code: 'UND_ERR_INVALID_ARG' }
  )

  const next = pool.request({ path: '/', method: 'GET' })
    .then(async ({ body }) => body.text())
  let timer
  const outcome = await Promise.race([
    next,
    new Promise(resolve => { timer = setTimeout(() => resolve('TIMEOUT'), 500) })
  ]).finally(() => clearTimeout(timer))

  const { connected, free, running, pending, queued, size } = pool.stats
  console.log({ outcome, received, connected, free, running, pending, queued, size })
  assert.equal(outcome, 'ok')
  assert.equal(received, 2)
})
