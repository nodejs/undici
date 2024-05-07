'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { request } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')

test('aborting request with custom reason', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer(() => {}).listen(0)

  after(() => server.close())
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
    /Error: aborted/
  )

  await t.rejects(
    request(`http://localhost:${server.address().port}`, { signal: ac2.signal }),
    { name: 'AbortError' }
  )

  await t.completed
})
