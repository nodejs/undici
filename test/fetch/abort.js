'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const { DOMException } = require('../../lib/fetch/constants')
const { nodeMajor } = require('../../lib/core/util')

const { AbortController: NPMAbortController } = require('abort-controller')

test('Allow the usage of custom implementation of AbortController', async (t) => {
  const body = {
    fixes: 1605
  }

  const server = createServer((req, res) => {
    res.statusCode = 200
    res.end(JSON.stringify(body))
  })

  t.teardown(server.close.bind(server))

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
    t.equal(e.code, DOMException.ABORT_ERR)
  }
})

test('allows aborting with custom errors', { skip: nodeMajor === 16 }, async (t) => {
  const server = createServer().listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  t.test('Using AbortSignal.timeout with cause', async (t) => {
    t.plan(2)

    try {
      await fetch(`http://localhost:${server.address().port}`, {
        signal: AbortSignal.timeout(50)
      })
      t.fail('should throw')
    } catch (err) {
      if (err.name === 'TypeError') {
        const cause = err.cause
        t.equal(cause.name, 'HeadersTimeoutError')
        t.equal(cause.code, 'UND_ERR_HEADERS_TIMEOUT')
      } else if (err.name === 'TimeoutError') {
        t.equal(err.code, DOMException.TIMEOUT_ERR)
        t.equal(err.cause, undefined)
      } else {
        t.error(err)
      }
    }
  })

  t.test('Error defaults to an AbortError DOMException', async (t) => {
    const ac = new AbortController()
    ac.abort() // no reason

    await t.rejects(
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
