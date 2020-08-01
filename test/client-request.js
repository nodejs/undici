'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/symbols')

test('request abort before headers', (t) => {
  t.plan(2)

  const signal = new EE()
  const server = createServer((req, res) => {
    res.end('hello')
    signal.emit('abort')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
})

test('trailers', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      onTrailers: ({ trailers }) => {
        t.strictDeepEqual({ 'content-md5': 'test' }, trailers)
      }
    }, (err, data) => {
      t.error(err)
      data.body.on('end', () => {
        t.pass()
      }).resume()
    })
  })
})

test('info', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.writeProcessing()
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: 'hello',
      onInfo: ({ statusCode, headers }) => {
        t.strictEqual(statusCode, 102)
      }
    }, (err, data) => {
      t.error(err)
      let recv = ''
      data.body.on('end', () => {
        t.strictEqual(recv, 'hello')
      }).on('data', buf => {
        recv += buf
      })
    })
  })
})
