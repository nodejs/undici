'use strict'

const { test } = require('node:test')
const { Client, Pool, Agent, fetch, setGlobalDispatcher, getGlobalDispatcher } = require('../../')
const http = require('node:http')
const https = require('node:https')
const pem = require('@metcoder95/https-pem')
const fs = require('node:fs')
const { tspl } = require('@matteo.collina/tspl')

const skip = process.platform === 'win32'

test('http unix get', { skip }, async (t) => {
  let client
  const p = tspl(t, { plan: 7 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.equal('/', req.url)
    p.equal('GET', req.method)
    p.equal('localhost', req.headers.host)
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
      p.ifError(err)
      const { statusCode, headers, body } = data
      p.equal(statusCode, 200)
      p.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        p.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await p.completed
})

test('http unix get pool', { skip }, async (t) => {
  let client
  const p = tspl(t, { plan: 7 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.equal('/', req.url)
    p.equal('GET', req.method)
    p.equal('localhost', req.headers.host)
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
      p.ifError(err)
      const { statusCode, headers, body } = data
      p.equal(statusCode, 200)
      p.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        p.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await p.completed
})

test('https get with tls opts', { skip }, async (t) => {
  let client
  const p = tspl(t, { plan: 6 })

  const server = https.createServer({ ...pem, joinDuplicateHeaders: true }, (req, res) => {
    p.equal('/', req.url)
    p.equal('GET', req.method)
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
      p.ifError(err)
      const { statusCode, headers, body } = data
      p.equal(statusCode, 200)
      p.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        p.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
  await p.completed
})

test('fetch http over unix socket', { skip }, async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.equal('/', req.url)
    p.equal('GET', req.method)
    p.equal('localhost', req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  t.after(async () => {
    server.close()
    await agent?.close()
  })

  try {
    fs.unlinkSync('/var/tmp/test3.sock')
  } catch (err) {

  }

  await new Promise((resolve) => {
    server.listen('/var/tmp/test3.sock', resolve)
  })

  const agent = new Agent({ connect: { socketPath: '/var/tmp/test3.sock' } })

  const res = await fetch('http://localhost/', { dispatcher: agent })
  p.equal(res.status, 200)
  p.equal(res.headers.get('content-type'), 'text/plain')
  const body = await res.text()
  p.equal(body, 'hello')

  await p.completed
})

test('fetch http over unix socket with global dispatcher', { skip }, async (t) => {
  const agent = new Agent({ connect: { socketPath: '/var/tmp/test3.sock' } })
  const p = tspl(t, { plan: 6 })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    p.equal('/', req.url)
    p.equal('GET', req.method)
    p.equal('localhost', req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  const prev = getGlobalDispatcher()

  t.after(async () => {
    server.close()
    // restore previous global dispatcher
    if (prev) setGlobalDispatcher(prev)
    await agent?.close()
  })

  try {
    fs.unlinkSync('/var/tmp/test3.sock')
  } catch (err) {

  }

  await new Promise((resolve) => {
    server.listen('/var/tmp/test3.sock', resolve)
  })

  setGlobalDispatcher(agent)

  const res = await fetch('http://localhost/')
  p.equal(res.status, 200)
  p.equal(res.headers.get('content-type'), 'text/plain')
  const body = await res.text()
  p.equal(body, 'hello')

  await p.completed
})
