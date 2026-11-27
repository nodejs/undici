'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const net = require('node:net')
const { join } = require('node:path')
const tls = require('node:tls')
const { BalancedPool, Pool } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
const ca = readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')

const secureContext = tls.createSecureContext({ cert, key })

// A TLS server that, when `resetFirst` is set, resets the first TCP
// connection as soon as it has received the complete ClientHello record,
// before the handshake can complete. Every other connection is served
// normally.
async function startServer (t, { resetFirst }) {
  let accepted = 0

  const server = net.createServer((socket) => {
    if (resetFirst && accepted++ === 0) {
      let buffered = Buffer.alloc(0)
      socket.on('data', (chunk) => {
        buffered = Buffer.concat([buffered, chunk])
        if (buffered.length >= 5 && buffered.length >= 5 + buffered.readUInt16BE(3)) {
          socket.resetAndDestroy()
        }
      })
      return
    }

    const tlsSocket = new tls.TLSSocket(socket, { isServer: true, secureContext })
    let request = ''
    tlsSocket.on('data', (chunk) => {
      request += chunk.toString('latin1')
      if (request.includes('\r\n\r\n')) {
        tlsSocket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok')
      }
    })
    tlsSocket.on('error', () => {})
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  return `https://localhost:${server.address().port}`
}

const options = {
  connections: 1,
  allowH2: false,
  connect: { ca, servername: 'agent1' }
}

async function assertOk (responsePromise) {
  const { statusCode, body } = await responsePromise
  assert.strictEqual(statusCode, 200)
  assert.strictEqual(await body.text(), 'ok')
}

test('BalancedPool with a single upstream recovers after the only connection is reset during the TLS handshake', async (t) => {
  const origin = await startServer(t, { resetFirst: true })
  const pool = new BalancedPool(origin, options)
  t.after(() => pool.destroy())

  await assert.rejects(pool.request({ path: '/', method: 'GET' }), { code: 'ECONNRESET' })

  const second = pool.request({ path: '/', method: 'GET' })
  second.catch(() => {})
  // The upstream must be selectable again, so the request is handed to it
  // right away instead of waiting in the BalancedPool queue.
  assert.strictEqual(pool.stats.queued, 0)
  await assertOk(second)
})

test('BalancedPool with a single upstream serves sequential requests without a reset', async (t) => {
  const origin = await startServer(t, { resetFirst: false })
  const pool = new BalancedPool(origin, options)
  t.after(() => pool.destroy())

  await assertOk(pool.request({ path: '/', method: 'GET' }))
  await assertOk(pool.request({ path: '/', method: 'GET' }))
})

test('Pool recovers after the only connection is reset during the TLS handshake', async (t) => {
  const origin = await startServer(t, { resetFirst: true })
  const pool = new Pool(origin, options)
  t.after(() => pool.destroy())

  await assert.rejects(pool.request({ path: '/', method: 'GET' }), { code: 'ECONNRESET' })
  await assertOk(pool.request({ path: '/', method: 'GET' }))
})
