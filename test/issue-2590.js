'use strict'

const { test } = require('tap')
const { request } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')

test('aborting request with custom reason', async (t) => {
  const server = createServer(() => {}).listen(0)

  t.teardown(server.close.bind(server))
  await once(server, 'listening')

  const timeout = AbortSignal.timeout(0)
  const ac = new AbortController()
  ac.abort(new Error('aborted'))

  const ac2 = new AbortController()
  ac2.abort() // no reason

  await t.rejects(
    request(`http://localhost:${server.address().port}`, { signal: timeout }),
    timeout.reason
  )

  await t.rejects(
    request(`http://localhost:${server.address().port}`, { signal: ac.signal }),
    ac.signal.reason
  )

  await t.rejects(
    request(`http://localhost:${server.address().port}`, { signal: ac2.signal }),
    { code: 'UND_ERR_ABORTED' }
  )
})
