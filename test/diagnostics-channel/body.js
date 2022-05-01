'use strict'

const { test, skip } = require('tap')

/** @type {import('diagnostics_channel')} */
let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  skip('missing diagnostics_channel')
  process.exit(0)
}

const { request } = require('../..')
const { createServer } = require('http')
const { once } = require('events')
const util = require('util')
const Blob = require('buffer').Blob

if (!Blob) {
  skip('missing Blob')
  process.exit(0)
}

const server = createServer((req, res) => {
  if (req.url === '/json') {
    return res.end(JSON.stringify({
      hello: 'world'
    }))
  } else {
    return res.end('hello world')
  }
})

test('undici:body:consumed diagnostics channel works', async (t) => {
  server.listen(0)
  await once(server, 'listening')
  t.teardown(server.close.bind(server))

  t.test('body consumed as text is a string', async (t) => {
    t.plan(2)

    const channel = diagnosticsChannel.channel('undici:body:consumed')
    const listener = (v) => t.equal(v.body, 'hello world')

    t.teardown(() => channel.unsubscribe(listener))
    channel.subscribe(listener)

    const { body } = await request(`http://localhost:${server.address().port}`)
    const text = await body.text()

    t.equal(text, 'hello world')
  })

  t.test('body consumed as json is an object', async (t) => {
    t.plan(2)

    const channel = diagnosticsChannel.channel('undici:body:consumed')
    const listener = (v) => t.same(v.body, { hello: 'world' })

    t.teardown(() => channel.unsubscribe(listener))
    channel.subscribe(listener)

    const { body } = await request(`http://localhost:${server.address().port}/json`)
    const json = await body.json()

    t.same(json, { hello: 'world' })
  })

  t.test('body consumed as an ArrayBuffer is an ArrayBuffer', async (t) => {
    t.plan(2)

    const uint8 = new Uint8Array(Buffer.from('hello world'))

    const channel = diagnosticsChannel.channel('undici:body:consumed')
    const listener = (v) => t.same(v.body, uint8)

    t.teardown(() => channel.unsubscribe(listener))
    channel.subscribe(listener)

    const { body } = await request(`http://localhost:${server.address().port}`)
    const arrayBuffer = await body.arrayBuffer()

    t.same(arrayBuffer, uint8)
  })

  t.test('body consumed as an ArrayBuffer is an ArrayBuffer', async (t) => {
    t.plan(2)

    const uint8 = new Uint8Array(Buffer.from('hello world'))

    const channel = diagnosticsChannel.channel('undici:body:consumed')
    const listener = (v) => t.same(v.body, uint8)

    t.teardown(() => channel.unsubscribe(listener))
    channel.subscribe(listener)

    const { body } = await request(`http://localhost:${server.address().port}`)
    const arrayBuffer = await body.arrayBuffer()

    t.same(arrayBuffer, uint8)
  })

  t.test('body consumed as a Blob is a Blob', async (t) => {
    t.plan(2)

    const expectedBlob = new Blob(['hello world'])

    const channel = diagnosticsChannel.channel('undici:body:consumed')
    const listener = (v) => t.same(v.body, expectedBlob)

    t.teardown(() => channel.unsubscribe(listener))
    channel.subscribe(listener)

    const { body } = await request(`http://localhost:${server.address().port}`)
    const blob = await body.blob()

    t.same(expectedBlob, blob)
  })

  t.test('ensure request is a request', async (t) => {
    let req1, req2

    const listener1 = ({ request }) => (req1 = request)
    const listener2 = ({ request }) => (req2 = request)

    diagnosticsChannel.channel('undici:request:create').subscribe(listener1)
    diagnosticsChannel.channel('undici:body:consumed').subscribe(listener2)

    t.teardown(() => {
      diagnosticsChannel.channel('undici:request:create').unsubscribe(listener1)
      diagnosticsChannel.channel('undici:body:consumed').unsubscribe(listener2)
    })

    const { body } = await request(`http://localhost:${server.address().port}/json`)
    await body.arrayBuffer() // consume the body so undici:body:consumed is triggered

    t.ok(util.isDeepStrictEqual(req1, req2))
    t.end()
  })

  t.end()
})
