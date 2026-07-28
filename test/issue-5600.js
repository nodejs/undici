'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Pool } = require('..')

test('https://github.com/nodejs/undici/issues/5600', async (t) => {
  t = tspl(t, { plan: 2 })

  const requests = 6
  const serverDelay = 10

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-length': 2 })
      res.end('ok')
    }, serverDelay)
  })

  server.listen(0)
  await once(server, 'listening')

  const pool = new Pool(`http://127.0.0.1:${server.address().port}`, { connections: 1 })

  after(async () => {
    await pool.close()
    server.close()
    await once(server, 'close')
  })

  let slowest = 0
  for (let i = 0; i < requests; i++) {
    const start = process.hrtime.bigint()
    const { statusCode, body } = await pool.request({ path: '/', method: 'GET' })
    await body.text()
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6

    if (statusCode !== 200) {
      t.fail(`request ${i} returned ${statusCode}`)
      return
    }
    if (elapsed > slowest) {
      slowest = elapsed
    }
  }

  t.ok(true, 'every request completed')
  // An idle keep-alive socket is revalidated on a setImmediate. While that
  // immediate was unref'd it could be skipped on an otherwise idle event loop,
  // and the queued request only progressed on the next fast-timers tick, so a
  // reuse cost roughly 500ms instead of the server's 10ms.
  t.ok(slowest < 250, `slowest request took ${slowest.toFixed(1)}ms, expected well under a fast-timers tick`)
})
