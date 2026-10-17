'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, setGlobalOrigin, getGlobalOrigin } = require('../..')

// The referrer/origin algorithms call sameOrigin() to compare two URLs.
// These tests guard against passing the request object (which has no
// protocol/hostname/port/origin of the shape sameOrigin reads) in place of a
// URL, which made the comparison always report "not same origin".

test('same-origin referrer policy keeps the full same-origin referrer', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.assert.strictEqual(req.headers.referer, `http://127.0.0.1:${port}/page?x=1`)
    res.end('ok')
  }).listen(0)

  t.after(() => server.close())
  await once(server, 'listening')
  const { port } = server.address()

  await fetch(`http://127.0.0.1:${port}/target`, {
    referrerPolicy: 'same-origin',
    referrer: `http://127.0.0.1:${port}/page?x=1`
  })
})

test('origin-when-cross-origin keeps the full referrer when same-origin', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.assert.strictEqual(req.headers.referer, `http://127.0.0.1:${port}/page?x=1`)
    res.end('ok')
  }).listen(0)

  t.after(() => server.close())
  await once(server, 'listening')
  const { port } = server.address()

  await fetch(`http://127.0.0.1:${port}/target`, {
    referrerPolicy: 'origin-when-cross-origin',
    referrer: `http://127.0.0.1:${port}/page?x=1`
  })
})

test('same-origin referrer policy sends the real Origin header on a same-origin request', async (t) => {
  t.plan(1)

  const previousOrigin = getGlobalOrigin()
  const server = createServer((req, res) => {
    t.assert.strictEqual(req.headers.origin, `http://127.0.0.1:${port}`)
    res.end('ok')
  }).listen(0)

  t.after(() => {
    server.close()
    setGlobalOrigin(previousOrigin)
  })
  await once(server, 'listening')
  const { port } = server.address()
  setGlobalOrigin(`http://127.0.0.1:${port}`)

  await fetch(`http://127.0.0.1:${port}/target`, {
    method: 'POST',
    referrerPolicy: 'same-origin',
    body: 'x'
  })
})

test('a same-origin redirect to a URL with credentials is followed in cors mode', async (t) => {
  t.plan(1)

  const previousOrigin = getGlobalOrigin()
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: `http://user:pass@127.0.0.1:${port}/target` })
      res.end()
      return
    }
    res.end('landed')
  }).listen(0)

  t.after(() => {
    server.close()
    setGlobalOrigin(previousOrigin)
  })
  await once(server, 'listening')
  const { port } = server.address()
  setGlobalOrigin(`http://127.0.0.1:${port}`)

  const res = await fetch(`http://127.0.0.1:${port}/redirect`)
  t.assert.strictEqual(await res.text(), 'landed')
})
