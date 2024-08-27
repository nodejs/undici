'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const FakeTimers = require('@sinonjs/fake-timers')

test('timeout with pipelining 1', async (t) => {
  t = tspl(t, { plan: 9 })

  const server = createServer()

  server.once('request', (req, res) => {
    t.ok(true, 'first request received, we are letting this timeout on the client')

    server.once('request', (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1,
      headersTimeout: 500,
      bodyTimeout: 500
    })
    after(() => client.close())

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
      t.ifError(err)
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

  await t.completed
})

test('Disable socket timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer()
  const clock = FakeTimers.install()
  after(clock.uninstall.bind(clock))

  server.once('request', (req, res) => {
    setTimeout(() => {
      res.end('hello')
    }, 31e3)
    clock.tick(32e3)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0,
      headersTimeout: 0
    })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, result) => {
      t.ifError(err)
      const bufs = []
      result.body.on('data', (buf) => {
        bufs.push(buf)
      })
      result.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await t.completed
})
