'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

test('allows aborting with custom errors', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await t.test('Using AbortSignal.timeout with cause', async (t) => {
    t.plan(2)
    try {
      await fetch(`http://localhost:${server.address().port}`, {
        signal: AbortSignal.timeout(50)
      })
      t.assert.fail('should throw')
    } catch (err) {
      if (err.name === 'TypeError') {
        const cause = err.cause
        t.assert.strictEqual(cause.name, 'HeadersTimeoutError')
        t.assert.strictEqual(cause.code, 'UND_ERR_HEADERS_TIMEOUT')
      } else if (err.name === 'TimeoutError') {
        t.assert.strictEqual(err.code, DOMException.TIMEOUT_ERR)
        t.assert.strictEqual(err.cause, undefined)
      } else {
        throw err
      }
    }
  })

  t.test('Error defaults to an AbortError DOMException', async () => {
    const ac = new AbortController()
    ac.abort() // no reason

    await t.assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        signal: ac.signal
      }),
      {
        name: 'AbortError',
        code: DOMException.ABORT_ERR
      }
    )
  })
})
