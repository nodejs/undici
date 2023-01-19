'use strict'

const { test } = require('tap')
const { fetch } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const { DOMException } = require('../../lib/fetch/constants')

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

test('allows aborting with custom errors', { skip: process.version.startsWith('v16.') }, async (t) => {
  const server = createServer().listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  t.test('Using AbortSignal.timeout', async (t) => {
    await t.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        signal: AbortSignal.timeout(50)
      }),
      {
        name: 'TimeoutError',
        code: DOMException.TIMEOUT_ERR
      }
    )
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
