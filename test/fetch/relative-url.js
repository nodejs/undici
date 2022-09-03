'use strict'

const { test, afterEach } = require('tap')
const { createServer } = require('http')
const { once } = require('events')
const {
  getGlobalOrigin,
  setGlobalOrigin,
  Response,
  Request,
  fetch
} = require('../..')

afterEach(() => setGlobalOrigin(undefined))

test('setGlobalOrigin & getGlobalOrigin', (t) => {
  t.equal(getGlobalOrigin(), undefined)

  setGlobalOrigin('http://localhost:3000')
  t.same(getGlobalOrigin(), new URL('http://localhost:3000'))

  setGlobalOrigin(undefined)
  t.equal(getGlobalOrigin(), undefined)

  setGlobalOrigin(new URL('http://localhost:3000'))
  t.same(getGlobalOrigin(), new URL('http://localhost:3000'))

  t.throws(() => {
    setGlobalOrigin('invalid.url')
  }, TypeError)

  t.throws(() => {
    setGlobalOrigin('wss://invalid.protocol')
  }, TypeError)

  t.throws(() => setGlobalOrigin(true))

  t.end()
})

test('Response.redirect', (t) => {
  t.throws(() => {
    Response.redirect('/relative/path', 302)
  }, TypeError('Failed to parse URL from /relative/path'))

  t.doesNotThrow(() => {
    setGlobalOrigin('http://localhost:3000')
    Response.redirect('/relative/path', 302)
  })

  setGlobalOrigin('http://localhost:3000')
  const response = Response.redirect('/relative/path', 302)
  // See step #7 of https://fetch.spec.whatwg.org/#dom-response-redirect
  t.equal(response.headers.get('location'), 'http://localhost:3000/relative/path')

  t.end()
})

test('new Request', (t) => {
  t.throws(
    () => new Request('/relative/path'),
    TypeError('Failed to parse URL from /relative/path')
  )

  t.doesNotThrow(() => {
    setGlobalOrigin('http://localhost:3000')
    // eslint-disable-next-line no-new
    new Request('/relative/path')
  })

  setGlobalOrigin('http://localhost:3000')
  const request = new Request('/relative/path')
  t.equal(request.url, 'http://localhost:3000/relative/path')

  t.end()
})

test('fetch', async (t) => {
  await t.rejects(async () => {
    await fetch('/relative/path')
  }, TypeError('Failed to parse URL from /relative/path'))

  t.test('Basic fetch', async (t) => {
    const server = createServer((req, res) => {
      t.equal(req.url, '/relative/path')
      res.end()
    }).listen(0)

    setGlobalOrigin(`http://localhost:${server.address().port}`)
    t.teardown(server.close.bind(server))
    await once(server, 'listening')

    await t.resolves(fetch('/relative/path'))
  })

  t.test('fetch return', async (t) => {
    const server = createServer((req, res) => {
      t.equal(req.url, '/relative/path')
      res.end()
    }).listen(0)

    setGlobalOrigin(`http://localhost:${server.address().port}`)
    t.teardown(server.close.bind(server))
    await once(server, 'listening')

    const response = await fetch('/relative/path')

    t.equal(response.url, `http://localhost:${server.address().port}/relative/path`)
  })
})
