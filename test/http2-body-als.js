'use strict'

const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createSecureServer } = require('node:http2')
const { join } = require('node:path')
const { test } = require('node:test')

const { Client } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'))
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'))

const IDS = [1, 2, 3]

// node http2 fires a stream's transport 'data' callback from the shared
// session context, not the stream's context, when several streams multiplex
// over one HTTP/2 session. onResponseData pushes each chunk into the request's
// BodyReadable without re-entering that request's AsyncResource, so a body
// 'data' listener can observe another concurrent request's AsyncLocalStorage
// store. The request callback already preserves context via runInAsyncScope;
// the body-chunk emission path must do the same.
// https://github.com/nodejs/undici/security/advisories/GHSA-7847-2mj8-cmxv
function buildServer () {
  const burstStreams = new Map()

  const server = createSecureServer({ key, cert })

  server.on('stream', (stream, headers) => {
    const [, mode, idText] = headers[':path'].split('/')
    const id = Number(idText)
    const payload = `remote-body-${id}`
    stream.respond({ ':status': 200, 'content-length': String(Buffer.byteLength(payload)) })

    if (mode === 'burst') {
      burstStreams.set(id, { stream, payload })
      if (burstStreams.size === IDS.length) {
        setImmediate(() => {
          for (const requestId of IDS) {
            const item = burstStreams.get(requestId)
            item.stream.end(item.payload)
          }
        })
      }
      return
    }

    stream.end(payload)
  })

  return server
}

function makeClient (origin) {
  return new Client(origin, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
}

async function run (t, perRequestClient) {
  const storage = new AsyncLocalStorage()
  const events = []
  const sinks = Object.fromEntries(IDS.map(id => [`tenant-${id}`, []]))
  const server = buildServer()

  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const origin = `https://localhost:${server.address().port}`
  const shared = perRequestClient ? null : makeClient(origin)
  const clients = new Set(shared ? [shared] : [])

  try {
    await Promise.all(IDS.map((id) => {
      const client = shared ?? makeClient(origin)
      clients.add(client)
      return new Promise((resolve, reject) => {
        storage.run(`tenant-${id}`, () => {
          const mode = perRequestClient ? 'isolated' : 'burst'
          client.request({ method: 'GET', path: `/${mode}/${id}` }, (err, response) => {
            if (err) return reject(err)
            response.body.on('data', chunk => {
              const store = storage.getStore()
              const request = `tenant-${id}`
              const value = chunk.toString()
              events.push({ request, store: store ?? null, chunk: value })
              sinks[store]?.push(value)
            })
            response.body.on('error', reject)
            response.body.on('end', resolve)
          })
        })
      })
    }))
  } finally {
    await Promise.all([...clients].map((client) => client.close()))
  }

  return { events, sinks }
}

test('shared HTTP/2 Client: body data events observe the owning request store', async (t) => {
  const { events, sinks } = await run(t, false)

  assert.strictEqual(events.length, IDS.length)
  for (const id of IDS) {
    assert.strictEqual(events[id - 1].request, `tenant-${id}`)
    assert.strictEqual(events[id - 1].store, `tenant-${id}`)
    assert.strictEqual(events[id - 1].chunk, `remote-body-${id}`)
    assert.deepStrictEqual(sinks[`tenant-${id}`], [`remote-body-${id}`])
  }
})

test('per-request HTTP/2 Client control: body data events observe the owning request store', async (t) => {
  const { events, sinks } = await run(t, true)

  assert.strictEqual(events.length, IDS.length)
  for (const id of IDS) {
    assert.deepStrictEqual(sinks[`tenant-${id}`], [`remote-body-${id}`])
  }
})
