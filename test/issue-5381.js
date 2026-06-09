'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { setTimeout: sleep } = require('node:timers/promises')
const { test } = require('node:test')
const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

async function waitFor (predicate, timeout = 1000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (predicate()) {
      return true
    }

    await sleep(10)
  }

  return predicate()
}

test('HTTP/2 idle sessions honor keepAliveTimeout', async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let open = 0

  server.on('secureConnection', (socket) => {
    open++
    socket.once('close', () => {
      open--
    })
  })
  server.on('stream', (stream) => {
    stream.respond({ ':status': 200 })
    stream.end('hello')
  })

  t.after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    keepAliveTimeout: 100,
    connect: {
      rejectUnauthorized: false
    }
  })
  t.after(() => client.close())

  const disconnected = once(client, 'disconnect')
  const response = await client.request({ path: '/', method: 'GET' })

  response.body.resume()
  await once(response.body, 'end')

  assert.strictEqual(open, 1)

  const idleReaped = await Promise.race([
    disconnected.then(() => true),
    sleep(1000).then(() => false)
  ])

  assert.strictEqual(idleReaped, true)
  assert.strictEqual(await waitFor(() => open === 0), true)
})
