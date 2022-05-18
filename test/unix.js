'use strict'

const { test } = require('tap')
const { Client, Pool } = require('..')
const http = require('http')
const https = require('https')
const pem = require('https-pem')
const fs = require('fs')

if (process.platform !== 'win32') {
  test('http unix get', (t) => {
    t.plan(7)

    const server = http.createServer((req, res) => {
      t.equal('/', req.url)
      t.equal('GET', req.method)
      t.equal('localhost', req.headers.host)
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello')
    })
    t.teardown(server.close.bind(server))

    try {
      fs.unlinkSync('/var/tmp/test3.sock')
    } catch (err) {

    }

    server.listen('/var/tmp/test3.sock', () => {
      const client = new Client({
        hostname: 'localhost',
        protocol: 'http:'
      }, {
        socketPath: '/var/tmp/test3.sock'
      })
      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        const { statusCode, headers, body } = data
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })

  test('http unix get pool', (t) => {
    t.plan(7)

    const server = http.createServer((req, res) => {
      t.equal('/', req.url)
      t.equal('GET', req.method)
      t.equal('localhost', req.headers.host)
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello')
    })
    t.teardown(server.close.bind(server))

    try {
      fs.unlinkSync('/var/tmp/test3.sock')
    } catch (err) {

    }

    server.listen('/var/tmp/test3.sock', () => {
      const client = new Pool({
        hostname: 'localhost',
        protocol: 'http:'
      }, {
        socketPath: '/var/tmp/test3.sock'
      })
      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        const { statusCode, headers, body } = data
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })

  test('https get with tls opts', (t) => {
    t.plan(6)

    const server = https.createServer(pem, (req, res) => {
      t.equal('/', req.url)
      t.equal('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
    t.teardown(server.close.bind(server))

    try {
      fs.unlinkSync('/var/tmp/test3.sock')
    } catch (err) {

    }

    server.listen('/var/tmp/test8.sock', () => {
      const client = new Client({
        hostname: 'localhost',
        protocol: 'https:'
      }, {
        socketPath: '/var/tmp/test8.sock',
        tls: {
          rejectUnauthorized: false
        }
      })
      t.teardown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.error(err)
        const { statusCode, headers, body } = data
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })
}
