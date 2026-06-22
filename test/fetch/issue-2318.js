'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

test('Undici preserves user-provided `Host` header', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, 'www.idk.org')

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'www.idk.org'
    }
  })
})

test('Undici preserves user-provided `Host` header without port', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, 'localhost')

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'localhost'
    }
  })
})

test('Undici sets Host header automatically when not user-provided', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, `localhost:${server.address().port}`)

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`)
})

test('Undici preserves user-provided `Host` header with custom domain', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, 'example.com')

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'example.com'
    }
  })
})

test('Undici preserves user-provided `Host` header with custom domain and port', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual(req.headers.host, 'example.com:8080')

    res.end()
  }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await fetch(`http://localhost:${server.address().port}`, {
    headers: {
      host: 'example.com:8080'
    }
  })
})
