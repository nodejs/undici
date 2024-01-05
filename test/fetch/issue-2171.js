'use strict'

const { fetch } = require('../..')
const { once } = require('events')
const { createServer } = require('http')
const { test } = require('node:test')
const assert = require('node:assert')

test('error reason is forwarded - issue #2171', { skip: !AbortSignal.timeout }, async (t) => {
  const server = createServer(() => {}).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const timeout = AbortSignal.timeout(100)
  await assert.rejects(
    fetch(`http://localhost:${server.address().port}`, {
      signal: timeout
    }),
    {
      name: 'TimeoutError',
      code: DOMException.TIMEOUT_ERR
    }
  )
})
