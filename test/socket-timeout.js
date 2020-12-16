'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('timeout with pipelining 1', (t) => {
  t.plan(9)

  const server = createServer()

  server.once('request', (req, res) => {
    t.pass('first request received, we are letting this timeout on the client')

    server.once('request', (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      headersTimeout: 500,
      bodyTimeout: 500
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      opaque: 'asd'
    }, (err, data) => {
      t.ok(err instanceof errors.HeadersTimeoutError) // we are expecting an error
      t.strictEqual(data.opaque, 'asd')
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('Disable socket timeout', (t) => {
  t.plan(2)

  const server = createServer()
  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  server.once('request', (req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 31e3)
    clock.tick(32e3)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0,
      headersTimeout: 0
    })
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, result) => {
      t.error(err)
      const bufs = []
      result.body.on('data', (buf) => {
        bufs.push(buf)
      })
      result.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})
