'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const http = require('node:http')
const { Pool } = require('../..')

const REQUESTS = 6
const SERVER_DELAY_MS = 50
const MAX_TIME_PER_REQUEST = 200

test('reusing an idle keep-alive socket must not stall', async (t) => {
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-length': 2 })
      res.end('ok')
    }, SERVER_DELAY_MS)
  })

  await new Promise((resolve) => server.listen(0, resolve))
  t.after(() => { server.close() })

  const pool = new Pool(`http://127.0.0.1:${server.address().port}`, { connections: 1 })
  t.after(async () => { await pool.close() })

  for (let i = 0; i < REQUESTS; i++) {
    const requestStart = Date.now()
    const res = await pool.request({ path: '/', method: 'GET' })
    await res.body.text()
    const elapsed = Date.now() - requestStart
    assert.ok(elapsed < MAX_TIME_PER_REQUEST,
      `Request #${i + 1} took ${elapsed}ms (max allowed: ${MAX_TIME_PER_REQUEST}ms)`)
  }
})
