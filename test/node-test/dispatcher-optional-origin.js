'use strict'

const { describe, test } = require('node:test')
const { once } = require('node:events')
const http = require('node:http')
const { Agent, Pool, Client } = require('../..')
const { tspl } = require('@matteo.collina/tspl')
const { closeServerAsPromise } = require('../utils/node-http')

// Regression tests for the documented behaviour of the optional `origin` option
// in DispatchOptions/RequestOptions.
//
// The docs described `origin` as "(optional)" on `dispatcher.dispatch()`, which
// reads as "never required". That only holds for a dispatcher already bound to a
// single origin. `Agent` is not bound to one origin and requires it, so the
// distinction is now spelled out in docs/docs/api/Dispatcher.md.
describe('optional origin option', () => {
  const startServer = async (t) => {
    const server = http.createServer({ joinDuplicateHeaders: true }, (_req, res) => {
      res.end('ok')
    })
    server.listen(0)
    await once(server, 'listening')
    // Pass the promise, not an awaited call: registering it directly keeps the
    // teardown order identical to the rest of this suite.
    t.after(closeServerAsPromise(server))
    return `http://localhost:${server.address().port}`
  }

  test('Pool falls back to its own origin when options.origin is omitted', async t => {
    const origin = await startServer(t)
    const pool = new Pool(origin)
    t.after(() => pool.close())

    const { statusCode, body } = await pool.request({ path: '/', method: 'GET' })

    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(await body.text(), 'ok')
  })

  test('Client falls back to its own origin when options.origin is omitted', async t => {
    const origin = await startServer(t)
    const client = new Client(origin)
    t.after(() => client.close())

    const { statusCode, body } = await client.request({ path: '/', method: 'GET' })

    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(await body.text(), 'ok')
  })

  test('Agent throws InvalidArgumentError when options.origin is omitted', async t => {
    const origin = await startServer(t)
    const agent = new Agent()
    t.after(() => agent.close())
    const p = tspl(t, { plan: 2 })

    // The error is thrown synchronously out of dispatch, so assert it escapes
    // as a rejection rather than resolving against a different origin.
    await p.rejects(agent.request({ path: '/', method: 'GET' }), {
      code: 'UND_ERR_INVALID_ARG',
      message: 'opts.origin must be a non-empty string or URL.'
    })

    // Guard against silently "passing" if the error text ever changes shape.
    p.strictEqual(typeof origin, 'string')
  })

  test('Agent accepts an explicit options.origin', async t => {
    const origin = await startServer(t)
    const agent = new Agent()
    t.after(() => agent.close())

    const { statusCode, body } = await agent.request({ origin, path: '/', method: 'GET' })

    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(await body.text(), 'ok')
  })
})
