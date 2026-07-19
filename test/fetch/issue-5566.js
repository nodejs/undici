'use strict'
/* global WeakRef */

const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { test } = require('node:test')

const pem = require('@metcoder95/https-pem')

const { Client, fetch } = require('../..')
const { closeClientAndServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/5566
test('an aborted fetch is released while its HTTP/2 session remains open', { timeout: 30000 }, async (t) => {
  if (typeof global.gc === 'undefined') {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  let sessionCount = 0
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('session', () => {
    sessionCount++
  })
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })

    if (headers[':path'] === '/abort') {
      stream.write('partial')
    } else {
      stream.end('ok')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const origin = `https://localhost:${server.address().port}`
  const client = new Client(origin, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
  t.after(closeClientAndServerAsPromise(client, server))

  async function abortFetch () {
    const reason = { message: 'abort reason' }
    const reasonRef = new WeakRef(reason)
    const controller = new AbortController()
    const response = await fetch(`${origin}/abort`, {
      dispatcher: client,
      signal: controller.signal
    })

    controller.abort(reason)
    await response.text().catch(() => {})

    return reasonRef
  }

  const reasonRef = await abortFetch()
  const response = await fetch(`${origin}/complete`, { dispatcher: client })
  t.assert.strictEqual(await response.text(), 'ok')
  t.assert.strictEqual(sessionCount, 1)

  for (let i = 0; i < 20 && reasonRef.deref() !== undefined; i++) {
    await new Promise(resolve => setImmediate(resolve))
    global.gc()
  }

  t.assert.strictEqual(
    reasonRef.deref(),
    undefined,
    'the completed request queue retained the aborted fetch'
  )
})
