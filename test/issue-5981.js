'use strict'

const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const diagnosticsChannel = require('node:diagnostics_channel')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createServer } = require('node:http')
const { createSecureServer } = require('node:http2')
const { createServer: createHttpsServer } = require('node:https')
const { join } = require('node:path')
const { test } = require('node:test')

const { Agent, Pool, fetch, request } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')

function collectContexts (t, storage) {
  const contexts = {}
  const onCreate = ({ request }) => {
    contexts[request.path] = storage.getStore()
  }
  diagnosticsChannel.subscribe('undici:request:create', onCreate)
  t.after(() => diagnosticsChannel.unsubscribe('undici:request:create', onCreate))
  return contexts
}

async function listen (t, server) {
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())
  return server.address().port
}

const expected = { '/a': 'a', '/b': 'b', '/c': 'c' }

// https://github.com/nodejs/undici/issues/5981
for (const [name, createTlsServer] of [
  ['h1', () => createHttpsServer({ key, cert }, (req, res) => res.end('ok'))],
  ['h2', () => createSecureServer({ key, cert, allowHTTP1: true }, (req, res) => res.end('ok'))]
]) {
  test(`requests queued during ALPN negotiation keep their async context (${name})`, async (t) => {
    const storage = new AsyncLocalStorage()
    const contexts = collectContexts(t, storage)
    const port = await listen(t, createTlsServer())

    const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
    t.after(() => dispatcher.close())

    await Promise.all(['a', 'b', 'c'].map((name) => storage.run(name, async () => {
      const res = await fetch(`https://localhost:${port}/${name}`, { dispatcher })
      await res.text()
    })))

    assert.deepStrictEqual(contexts, expected)
  })
}

test('requests queued in a Pool keep their async context', async (t) => {
  const storage = new AsyncLocalStorage()
  const contexts = collectContexts(t, storage)
  const port = await listen(t, createServer((req, res) => res.end('ok')))

  const pool = new Pool(`http://localhost:${port}`, { connections: 1 })
  t.after(() => pool.close())

  await Promise.all(['a', 'b', 'c'].map((name) => storage.run(name, async () => {
    const { body } = await request(`http://localhost:${port}/${name}`, { dispatcher: pool })
    await body.dump()
  })))

  assert.deepStrictEqual(contexts, expected)
})
