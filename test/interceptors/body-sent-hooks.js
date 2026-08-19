'use strict'

// Regression test for https://github.com/nodejs/undici/issues/5695
// DecoratorHandler used to swallow onBodySent (empty method) and omit
// onRequestSent, so composing any interceptor dropped those hooks.

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { Client, DecoratorHandler, interceptors } = require('../../')

const BODY = '{"hello":"world"}'

function dispatchAndTrack (dispatcher) {
  const seen = { bodySent: [], requestSent: 0 }
  return new Promise((resolve, reject) => {
    dispatcher.dispatch(
      {
        method: 'POST',
        path: '/',
        headers: { 'content-type': 'application/json' },
        body: BODY
      },
      {
        onRequestStart () {},
        onBodySent (chunk) {
          seen.bodySent.push(Buffer.from(chunk).toString())
        },
        onRequestSent () {
          seen.requestSent++
        },
        onResponseStart () {},
        onResponseData () {},
        onResponseEnd () {
          resolve(seen)
        },
        onResponseError (_controller, err) {
          reject(err)
        }
      }
    )
  })
}

async function withClient (t, compose) {
  const server = createServer((req, res) => {
    req.resume()
    req.on('end', () => res.end('ok'))
  })
  server.listen(0)
  await once(server, 'listening')
  t.after(() => server.close())

  let client = new Client(`http://localhost:${server.address().port}`)
  if (compose) {
    client = compose(client)
  }
  t.after(() => client.close())
  return client
}

test('onBodySent/onRequestSent fire on a bare Client', async (t) => {
  const client = await withClient(t)
  const seen = await dispatchAndTrack(client)
  t.assert.deepStrictEqual(seen.bodySent, [BODY])
  t.assert.strictEqual(seen.requestSent, 1)
})

test('onBodySent/onRequestSent survive DecoratorHandler', async (t) => {
  const client = await withClient(t, (c) =>
    c.compose((dispatch) => (opts, handler) => dispatch(opts, new DecoratorHandler(handler)))
  )
  const seen = await dispatchAndTrack(client)
  t.assert.deepStrictEqual(seen.bodySent, [BODY])
  t.assert.strictEqual(seen.requestSent, 1)
})

test('onBodySent/onRequestSent survive interceptors.retry()', async (t) => {
  const client = await withClient(t, (c) => c.compose(interceptors.retry()))
  const seen = await dispatchAndTrack(client)
  t.assert.deepStrictEqual(seen.bodySent, [BODY])
  t.assert.strictEqual(seen.requestSent, 1)
})

test('onBodySent/onRequestSent survive interceptors.cache()', async (t) => {
  const client = await withClient(t, (c) => c.compose(interceptors.cache()))
  const seen = await dispatchAndTrack(client)
  t.assert.deepStrictEqual(seen.bodySent, [BODY])
  t.assert.strictEqual(seen.requestSent, 1)
})

test('onBodySent/onRequestSent survive interceptors.redirect()', async (t) => {
  const client = await withClient(t, (c) =>
    c.compose(interceptors.redirect({ maxRedirections: 0 }))
  )
  const seen = await dispatchAndTrack(client)
  t.assert.deepStrictEqual(seen.bodySent, [BODY])
  t.assert.strictEqual(seen.requestSent, 1)
})
