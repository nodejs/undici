'use strict'

const { fetch } = require('../..')
const { DOMException } = require('../../lib/fetch/constants')
const { once } = require('events')
const { createServer } = require('http')
const { test } = require('tap')

test('error reason is forwarded - issue #2171', { skip: !AbortSignal.timeout }, async (t) => {
  const server = createServer(() => {}).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const timeout = AbortSignal.timeout(100)
  await t.rejects(
    fetch(`http://localhost:${server.address().port}`, {
      signal: timeout
    }),
    {
      name: 'TimeoutError',
      code: DOMException.TIMEOUT_ERR
    }
  )
})
