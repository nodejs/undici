'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')

const { closeServerAsPromise } = require('../utils/node-http')

const { AbortController: NPMAbortController } = require('abort-controller')

test('Allow the usage of custom implementation of AbortController', async (t) => {
  const body = {
    fixes: 1605
  }

  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end(JSON.stringify(body))
  })

  t.after(closeServerAsPromise(server))

  server.listen(0)
  await once(server, 'listening')

  const controller = new NPMAbortController()
  const signal = controller.signal
  controller.abort()

  try {
    await fetch(`http://localhost:${server.address().port}`, {
      signal
    })
  } catch (e) {
    assert.strictEqual(e.code, DOMException.ABORT_ERR)
  }
})

test('allows aborting with custom errors', async (t) => {
  const server = createServer().listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await t.test('Using AbortSignal.timeout with cause', async () => {
    const { strictEqual } = tspl(t, { plan: 2 })
    try {
      await fetch(`http://localhost:${server.address().port}`, {
        signal: AbortSignal.timeout(50)
      })
      assert.fail('should throw')
    } catch (err) {
      if (err.name === 'TypeError') {
        const cause = err.cause
        strictEqual(cause.name, 'HeadersTimeoutError')
        strictEqual(cause.code, 'UND_ERR_HEADERS_TIMEOUT')
      } else if (err.name === 'TimeoutError') {
        strictEqual(err.code, DOMException.TIMEOUT_ERR)
        strictEqual(err.cause, undefined)
      } else {
        throw err
      }
    }
  })

  t.test('Error defaults to an AbortError DOMException', async () => {
    const ac = new AbortController()
    ac.abort() // no reason

    await assert.rejects(
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
