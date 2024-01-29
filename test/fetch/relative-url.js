'use strict'

const { test, afterEach } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { once } = require('node:events')
const {
  getGlobalOrigin,
  setGlobalOrigin,
  Response,
  Request,
  fetch
} = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

afterEach(() => setGlobalOrigin(undefined))

test('setGlobalOrigin & getGlobalOrigin', () => {
  assert.strictEqual(getGlobalOrigin(), undefined)

  setGlobalOrigin('http://localhost:3000')
  assert.deepStrictEqual(getGlobalOrigin(), new URL('http://localhost:3000'))

  setGlobalOrigin(undefined)
  assert.strictEqual(getGlobalOrigin(), undefined)

  setGlobalOrigin(new URL('http://localhost:3000'))
  assert.deepStrictEqual(getGlobalOrigin(), new URL('http://localhost:3000'))

  assert.throws(() => {
    setGlobalOrigin('invalid.url')
  }, TypeError)

  assert.throws(() => {
    setGlobalOrigin('wss://invalid.protocol')
  }, TypeError)

  assert.throws(() => setGlobalOrigin(true))
})

test('Response.redirect', () => {
  assert.throws(() => {
    Response.redirect('/relative/path', 302)
  }, TypeError('Failed to parse URL from /relative/path'))

  assert.doesNotThrow(() => {
    setGlobalOrigin('http://localhost:3000')
    Response.redirect('/relative/path', 302)
  })

  setGlobalOrigin('http://localhost:3000')
  const response = Response.redirect('/relative/path', 302)
  // See step #7 of https://fetch.spec.whatwg.org/#dom-response-redirect
  assert.strictEqual(response.headers.get('location'), 'http://localhost:3000/relative/path')
})

test('new Request', (t) => {
  assert.throws(
    () => new Request('/relative/path'),
    TypeError('Failed to parse URL from /relative/path')
  )

  assert.doesNotThrow(() => {
    setGlobalOrigin('http://localhost:3000')
    // eslint-disable-next-line no-new
    new Request('/relative/path')
  })

  setGlobalOrigin('http://localhost:3000')
  const request = new Request('/relative/path')
  assert.strictEqual(request.url, 'http://localhost:3000/relative/path')
})

test('fetch', async (t) => {
  await assert.rejects(fetch('/relative/path'), TypeError('Failed to parse URL from /relative/path'))

  await t.test('Basic fetch', async (t) => {
    const server = createServer((req, res) => {
      assert.strictEqual(req.url, '/relative/path')
      res.end()
    }).listen(0)

    setGlobalOrigin(`http://localhost:${server.address().port}`)
    t.after(closeServerAsPromise(server))
    await once(server, 'listening')

    await assert.doesNotReject(fetch('/relative/path'))
  })

  await t.test('fetch return', async (t) => {
    const server = createServer((req, res) => {
      assert.strictEqual(req.url, '/relative/path')
      res.end()
    }).listen(0)

    setGlobalOrigin(`http://localhost:${server.address().port}`)
    t.after(closeServerAsPromise(server))
    await once(server, 'listening')

    const response = await fetch('/relative/path')

    assert.strictEqual(response.url, `http://localhost:${server.address().port}/relative/path`)
  })
})
