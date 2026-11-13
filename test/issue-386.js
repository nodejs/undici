'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { test } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')

const { Client } = require('..')

// https://github.com/nodejs/undici/issues/386
//
// A request whose signal is already aborted settles with the abort reason
// without being dispatched, so no connection is opened and a refused connection
// (ECONNREFUSED) cannot be reported in its place.

async function listen (t) {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end('asd')
  })
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  return server
}

test('an already aborted signal rejects the request without connecting', async (t) => {
  const server = await listen(t)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())

  let connections = 0
  client.on('connect', () => connections++)

  t = tspl(t, { plan: 2 })

  const reason = new Error('aborted before dispatch')
  const ac = new AbortController()
  ac.abort(reason)

  const err = await client.request({ path: '/', method: 'GET', signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err, reason)
  t.equal(connections, 0)

  await t.completed
})

test('an already aborted signal is reported instead of a connection error', async (t) => {
  const server = await listen(t)
  const { port } = server.address()

  // Nothing listens on the port anymore, so connecting would be refused.
  server.close()
  await once(server, 'close')

  const client = new Client(`http://localhost:${port}`)
  t.after(() => client.destroy())

  t = tspl(t, { plan: 1 })

  const reason = new Error('aborted before dispatch')
  const ac = new AbortController()
  ac.abort(reason)

  const err = await client.request({ path: '/', method: 'GET', signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err, reason)

  await t.completed
})

test('an already aborted signal destroys a stream body', async (t) => {
  const server = await listen(t)

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.destroy())

  t = tspl(t, { plan: 2 })

  const body = new Readable({ read () {} })
  const ac = new AbortController()
  ac.abort()

  const err = await client.request({ path: '/', method: 'POST', body, signal: ac.signal }).then(() => null, (err) => err)

  t.equal(err?.name, 'AbortError')
  t.equal(body.destroyed, true)

  await t.completed
})
