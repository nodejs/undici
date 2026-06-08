'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { once } = require('node:events')
const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')
const { Pool } = require('../..')

test('TLS altname errors reject pipelined requests', async (t) => {
  const server = https.createServer({
    key: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'cert.pem'))
  }, (req, res) => {
    res.end('ok')
  })

  t.after(() => {
    server.close()
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const pool = new Pool(`https://localhost:${server.address().port}`, {
    connections: 1,
    pipelining: 10,
    connect: {
      ca: fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'ca.pem'))
    }
  })

  t.after(async () => {
    await pool.close().catch(() => {})
  })

  const settled = await Promise.allSettled(
    Array.from({ length: 20 }, () => pool.request({ path: '/', method: 'GET' }))
  )

  assert.ok(settled.every(({ status }) => status === 'rejected'))
  assert.ok(settled.every(({ reason }) => reason.code === 'ERR_TLS_CERT_ALTNAME_INVALID'))
})
