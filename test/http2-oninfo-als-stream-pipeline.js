'use strict'

const assert = require('node:assert')
const { AsyncLocalStorage } = require('node:async_hooks')
const { once } = require('node:events')
const { readFileSync } = require('node:fs')
const { createSecureServer } = require('node:http2')
const { join } = require('node:path')
const { Writable } = require('node:stream')
const { test } = require('node:test')

const { Client } = require('..')

const key = readFileSync(join(__dirname, 'fixtures', 'key.pem'))
const cert = readFileSync(join(__dirname, 'fixtures', 'cert.pem'))

// The HTTP/2 session is created by the first request (Alice). Bob's request
// is queued while the session connects, so its stream is opened, and its
// transport callbacks run, in the async context of the connection. onInfo
// must still observe the context of the request that issued it, like
// request() does since #6208.
async function setup (t) {
  const server = createSecureServer({ key, cert })
  let sentInfoCount = 0

  server.on('stream', (stream, headers) => {
    if (headers[':path'] === '/bob') {
      stream.additionalHeaders({
        ':status': 103,
        link: '</bob.css>; rel=preload; as=style'
      })
      sentInfoCount++
    }
    stream.respond({ ':status': 200, 'content-length': '2' })
    stream.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: { rejectUnauthorized: false }
  })
  t.after(() => client.close())

  return { client, sentInfoCount: () => sentInfoCount }
}

function collect (chunks) {
  return new Writable({
    write (chunk, _encoding, callback) {
      chunks.push(chunk)
      callback()
    }
  })
}

function assertObservations (observations, sentInfoCount) {
  assert.strictEqual(sentInfoCount, 1)
  assert.deepStrictEqual(observations, [{
    observed: 'bob',
    statusCode: 103,
    link: '</bob.css>; rel=preload; as=style'
  }])
}

test('shared HTTP/2 Client: stream() onInfo runs in its request AsyncLocalStorage context', async (t) => {
  const storage = new AsyncLocalStorage()
  const observations = []
  const { client, sentInfoCount } = await setup(t)

  const streamFor = (tenant) => storage.run({ tenant }, () => {
    const chunks = []
    return client.stream({
      path: `/${tenant}`,
      method: 'GET',
      onInfo: (info) => {
        observations.push({
          observed: storage.getStore()?.tenant ?? null,
          statusCode: info.statusCode,
          link: info.headers.link ?? null
        })
      }
    }, () => collect(chunks)).then(() => Buffer.concat(chunks).toString())
  })

  const results = await Promise.all([streamFor('alice'), streamFor('bob')])
  assert.deepStrictEqual(results, ['ok', 'ok'])

  assertObservations(observations, sentInfoCount())
})

test('shared HTTP/2 Client: pipeline() onInfo runs in its request AsyncLocalStorage context', async (t) => {
  const storage = new AsyncLocalStorage()
  const observations = []
  const { client, sentInfoCount } = await setup(t)

  const pipelineFor = (tenant) => storage.run({ tenant }, async () => {
    const duplex = client.pipeline({
      path: `/${tenant}`,
      method: 'GET',
      onInfo: (info) => {
        observations.push({
          observed: storage.getStore()?.tenant ?? null,
          statusCode: info.statusCode,
          link: info.headers.link ?? null
        })
      }
    }, ({ body }) => body)
    duplex.end()

    const chunks = []
    for await (const chunk of duplex) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString()
  })

  const results = await Promise.all([pipelineFor('alice'), pipelineFor('bob')])
  assert.deepStrictEqual(results, ['ok', 'ok'])

  assertObservations(observations, sentInfoCount())
})
