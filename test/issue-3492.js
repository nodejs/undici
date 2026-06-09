'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { createServer } = require('node:http')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Pool, request } = require('..')

function immediateRequest (url, dispatcher) {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      request(url, { dispatcher }).then(resolve, reject)
    })
  })
}

test('issue #3492 - retries idempotent HTTP/1.1 request when idle socket closes before reuse', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('ok')
  })

  await once(server.listen(0), 'listening')

  const url = `http://localhost:${server.address().port}`
  const pool = new Pool(url)

  try {
    const first = await request(url, { dispatcher: pool })
    await first.body.text()

    server.closeIdleConnections()

    const second = await immediateRequest(url, pool)
    t.strictEqual(second.statusCode, 200)
    t.strictEqual(await second.body.text(), 'ok')
  } finally {
    await pool.close()
    await new Promise(resolve => server.close(resolve))
  }
})

test('issue #3492 - retries idempotent HTTP/2 request when idle socket closes before reuse', async t => {
  t = tspl(t, { plan: 3 })

  const sockets = new Set()
  const server = createSecureServer({
    ...await pem.generate({ opts: { keySize: 2048 } }),
    allowHTTP1: false
  })

  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  server.on('stream', stream => {
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  await once(server.listen(0), 'listening')

  const url = `https://localhost:${server.address().port}`
  const pool = new Pool(url, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })

  try {
    const first = await request(url, { dispatcher: pool })
    await first.body.text()

    t.ok(sockets.size > 0)
    for (const socket of sockets) {
      socket.end()
    }

    const second = await immediateRequest(url, pool)
    t.strictEqual(second.statusCode, 200)
    t.strictEqual(await second.body.text(), 'ok')
  } finally {
    await pool.close()
    await new Promise(resolve => server.close(resolve))
  }
})
