'use strict'

const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('h2 client multiplexes concurrent requests by default (#4143)', async t => {
  const N = 5
  const DELAY = 200
  t = tspl(t, { plan: N + 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  let inFlight = 0
  let peakInFlight = 0
  server.on('stream', stream => {
    inFlight++
    peakInFlight = Math.max(peakInFlight, inFlight)
    setTimeout(() => {
      inFlight--
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }, DELAY)
  })

  await once(server.listen(0), 'listening')
  after(() => server.close())

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true
  })
  after(() => client.close())

  const results = await Promise.all(
    Array.from({ length: N }, () =>
      client.request({ path: '/', method: 'GET' })
        .then(async r => {
          await r.body.text()
          return r.statusCode
        })
    )
  )

  for (const status of results) {
    t.strictEqual(status, 200)
  }

  // Without the fix, peakInFlight === 1 (serialized on a single h2 stream slot)
  // With the fix, peakInFlight === N (multiplexed)
  t.strictEqual(peakInFlight, N, `expected ${N} concurrent streams, got ${peakInFlight}`)
  // The server-advertised maxConcurrentStreams should be the effective ceiling,
  // not the H1 default of 1.
  t.ok(client.pipelining >= N, `expected pipelining >= ${N}, got ${client.pipelining}`)

  await t.completed
})
