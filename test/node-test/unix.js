'use strict'

const { test } = require('node:test')
const { Client, Pool } = require('../../')
const http = require('node:http')
const https = require('node:https')
const pem = require('@metcoder95/https-pem')
const fs = require('node:fs')
const { once } = require('node:events')

const skip = process.platform === 'win32'

test('http unix get', { skip }, async (t) => {
  let client
  t.plan(7)

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual('localhost', req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  t.after(() => {
    server.close()
    client.close()
  })

  try {
    fs.unlinkSync('/var/tmp/test3.sock')
  } catch (err) {

  }

  server.listen('/var/tmp/test3.sock', () => {
    client = new Client({
      hostname: 'localhost',
      protocol: 'http:'
    }, {
      socketPath: '/var/tmp/test3.sock'
    })

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.assert.ifError(err)
      const { statusCode, headers, body } = data
      t.assert.strictEqual(statusCode, 200)
      t.assert.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.assert.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        server.close()
      })
    })
  })

  await once(server, 'close')
})

test('http unix get pool', { skip }, async (t) => {
  let client
  t.plan(7)

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual('localhost', req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  t.after(() => {
    server.close()
    client.close()
  })

  try {
    fs.unlinkSync('/var/tmp/test3.sock')
  } catch (err) {

  }

  server.listen('/var/tmp/test3.sock', () => {
    client = new Pool({
      hostname: 'localhost',
      protocol: 'http:'
    }, {
      socketPath: '/var/tmp/test3.sock'
    })

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.assert.ifError(err)
      const { statusCode, headers, body } = data
      t.assert.strictEqual(statusCode, 200)
      t.assert.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.assert.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        server.close()
      })
    })
  })

  await once(server, 'close')
})

test('https get with tls opts', { skip }, async (t) => {
  t.plan(6)

  let client

  const server = https.createServer({ ...pem, joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })

  t.after(() => {
    server.close()
    client.close()
  })

  try {
    fs.unlinkSync('/var/tmp/test3.sock')
  } catch (err) {

  }

  server.listen('/var/tmp/test3.sock', () => {
    client = new Client({
      hostname: 'localhost',
      protocol: 'https:'
    }, {
      socketPath: '/var/tmp/test3.sock',
      tls: {
        rejectUnauthorized: false
      }
    })

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.assert.ifError(err)
      const { statusCode, headers, body } = data
      t.assert.strictEqual(statusCode, 200)
      t.assert.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.assert.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        server.close()
      })
    })
  })

  await once(server, 'close')
})
