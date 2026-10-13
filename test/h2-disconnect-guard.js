'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { guardAgainstUnexpectedDisconnect } = require('./utils/h2-disconnect-guard')

async function setup (t, clientOpts = {}) {
  const server = createSecureServer(pem)
  const sessions = []

  server.on('session', session => sessions.push(session))
  server.on('stream', stream => {
    stream.respond({ ':status': 200 })
    stream.end('hello h2!')
  })

  let client = null
  t.after(async () => {
    if (client != null && !client.destroyed) {
      await client.close()
    }
    await new Promise(resolve => server.close(resolve))
  })

  await once(server.listen(0, '127.0.0.1'), 'listening')

  client = new Client(`https://127.0.0.1:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    ...clientOpts
  })

  const failures = []
  guardAgainstUnexpectedDisconnect({ fail: message => failures.push(message) }, client)

  return { client, sessions, failures, get: () => client.request({ path: '/', method: 'GET' }) }
}

test('ignores the client tearing down its own idle session', async t => {
  // A saturated CI runner can stretch the gap between two requests past
  // keepAliveTimeout; the client then drops the idle socket itself and
  // reconnects transparently on the next request. That is not a disconnect the
  // test did not ask for.
  const { client, failures, get } = await setup(t, { keepAliveTimeout: 100 })

  const disconnected = once(client, 'disconnect')
  await (await get()).body.text()
  await disconnected

  assert.deepStrictEqual(failures, [])
})

test('flags a disconnect forced by the peer', async t => {
  const { client, sessions, failures, get } = await setup(t)

  const disconnected = once(client, 'disconnect')
  await (await get()).body.text()
  sessions[0].destroy()
  await disconnected

  assert.strictEqual(failures.length, 1)
  assert.match(failures[0], /^unexpected disconnect/)
})

test('stays quiet once the client is closing', async t => {
  const { client, failures, get } = await setup(t)

  await (await get()).body.text()
  await client.close()

  assert.deepStrictEqual(failures, [])
})
