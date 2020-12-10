'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/core/symbols')
const { Readable } = require('stream')

test('request abort before headers', (t) => {
  t.plan(6)

  const signal = new EE()
  const server = createServer((req, res) => {
    res.end('hello')
    signal.emit('abort')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
        t.strictEqual(signal.listenerCount('abort'), 0)
      })
      t.strictEqual(signal.listenerCount('abort'), 1)

      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
        t.strictEqual(signal.listenerCount('abort'), 0)
      })
      t.strictEqual(signal.listenerCount('abort'), 2)
    })
  })
})

test('request body destroyed on invalid callback', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const body = new Readable({
      read () {}
    })
    try {
      client.request({
        path: '/',
        method: 'GET',
        body
      }, null)
    } catch (err) {
      t.strictEqual(body.destroyed, true)
    }
  })
})

test('trailers', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const { body, trailers } = await client.request({
      path: '/',
      method: 'GET'
    })

    t.strictDeepEqual(trailers, {})

    body
      .on('data', () => t.fail())
      .on('end', () => {
        t.strictDeepEqual(trailers, { 'content-md5': 'test' })
      })
  })
})
