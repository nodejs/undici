'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const pem = require('https-pem')

if (process.platform !== 'win32') {
  test('http unix get', (t) => {
    t.plan(7)

    const server = createServer((req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      t.strictEqual('localhost', req.headers.host)
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello')
    })
    t.tearDown(server.close.bind(server))

    server.listen('/var/tmp/test3.sock', () => {
      const client = new Client({
        hostname: 'localhost',
        protocol: 'http:'
      }, {
        socketPath: '/var/tmp/test3.sock'
      })
      t.tearDown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        const { statusCode, headers, body } = data
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

  test('https unix get', (t) => {
    t.plan(7)

    const server = createServer(pem, (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      t.strictEqual('localhost', req.headers.host)
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello')
    })
    t.tearDown(server.close.bind(server))

    server.listen('/var/tmp/test4.sock', () => {
      const client = new Client({
        hostname: 'localhost',
        protocol: 'http:'
      }, {
        socketPath: '/var/tmp/test4.sock'
      })
      t.tearDown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        const { statusCode, headers, body } = data
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
}
