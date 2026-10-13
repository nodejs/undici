'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client, interceptors } = require('../../index')

test('a waiting request can retry when the primary accepts the response', { timeout: 5000 }, async t => {
  let hits = 0
  const server = createServer((req, res) => {
    res.writeHead(++hits === 1 ? 503 : 200).end()
  })
  t.after(() => server.close())
  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
    .compose(interceptors.deduplicate(), interceptors.retry({ minTimeout: 1, maxRetries: 1 }))
  t.after(() => client.destroy())

  const [primary, waiting] = await Promise.all([
    client.request({ method: 'GET', path: '/', retryOptions: { throwOnError: false, maxRetries: 0 } }),
    client.request({ method: 'GET', path: '/' })
  ])
  t.assert.strictEqual(primary.statusCode, 503)
  t.assert.strictEqual(waiting.statusCode, 200)
  await Promise.all([primary.body.dump(), waiting.body.dump()])
  t.assert.strictEqual(hits, 2)
})

for (const deduplicateFirst of [true, false]) {
  for (const throwOnError of [true, false]) {
    for (const synchronous of [true, false]) {
      for (const succeeds of [true, false]) {
        test(`deduplicate/retry: deduplicateFirst=${deduplicateFirst}, throwOnError=${throwOnError}, synchronous=${synchronous}, succeeds=${succeeds}`, { timeout: 5000 }, async t => {
          let hits = 0
          const statusCode = succeeds ? 429 : 503
          const server = createServer((req, res) => {
            hits++
            res.writeHead(succeeds && hits > 1 ? 200 : statusCode).end()
          })
          t.after(() => server.close())
          server.listen(0)
          await once(server, 'listening')

          const deduplicate = interceptors.deduplicate()
          const retry = interceptors.retry({
            throwOnError,
            maxRetries: 1,
            minTimeout: 1,
            retry: synchronous
              ? (err, { state }, cb) => cb(state.counter <= 1 ? null : err)
              : undefined
          })
          const client = new Client(`http://localhost:${server.address().port}`)
            .compose(...(deduplicateFirst ? [deduplicate, retry] : [retry, deduplicate]))
          t.after(() => client.destroy())

          const events = []
          const channel = diagnosticsChannel.channel('undici:request:pending-requests')
          const onPending = event => events.push(event)
          channel.subscribe(onPending)
          t.after(() => channel.unsubscribe(onPending))

          const request = { method: 'GET', path: '/' }
          const results = await Promise.allSettled([
            client.request(request),
            client.request(request)
          ])

          for (const result of results) {
            if (!succeeds && throwOnError) {
              t.assert.strictEqual(result.status, 'rejected')
              t.assert.strictEqual(result.reason.code, 'UND_ERR_REQ_RETRY')
              t.assert.strictEqual(result.reason.statusCode, statusCode)
            } else {
              t.assert.strictEqual(result.status, 'fulfilled')
              t.assert.strictEqual(result.value.statusCode, succeeds ? 200 : statusCode)
              t.assert.strictEqual(await result.value.body.text(), '')
            }
          }

          if (deduplicateFirst && !synchronous) {
            // Each request has its own retry timer. The retries only deduplicate
            // if they overlap; otherwise both make a separate origin request.
            t.assert.ok(hits === 2 || hits === 3, `expected 2 or 3 origin requests, got ${hits}`)
          } else {
            t.assert.strictEqual(hits, 2)
          }
          t.assert.strictEqual(events.at(-1).size, 0)
          t.assert.strictEqual(events.filter(event => event.type === 'added').length,
            events.filter(event => event.type === 'removed').length)

          // A later request for the same key must not attach to a stale entry.
          const hitsBeforeLater = hits
          const later = client.request(request)
          if (!succeeds && throwOnError) {
            await t.assert.rejects(later, { code: 'UND_ERR_REQ_RETRY', statusCode })
          } else {
            const response = await later
            t.assert.strictEqual(response.statusCode, succeeds ? 200 : statusCode)
            await response.body.dump()
          }
          t.assert.strictEqual(hits - hitsBeforeLater, succeeds ? 1 : 2)
          t.assert.strictEqual(events.at(-1).size, 0)
        })
      }
    }
  }
}
