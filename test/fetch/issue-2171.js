'use strict'

const { LOOPBACK_HOST } = require('../utils/node-http')
const { fetch } = require('../..')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { closeServerAsPromise } = require('../utils/node-http')

test('error reason is forwarded - issue #2171', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, () => {}).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  const timeout = AbortSignal.timeout(100)
  await t.assert.rejects(
    fetch(`http://${LOOPBACK_HOST}:${server.address().port}`, {
      signal: timeout
    }),
    {
      name: 'TimeoutError',
      code: DOMException.TIMEOUT_ERR
    }
  )
})
