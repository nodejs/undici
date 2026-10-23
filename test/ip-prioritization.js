'use strict'

const assert = require('node:assert')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const net = require('node:net')

test('HTTP/1.1 Request Prioritization', async () => {
  const priorities = []

  const server = createServer((req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    connect: (opts, cb) => {
      const socket = net.connect({
        ...opts,
        host: opts.hostname,
        port: opts.port
      }, () => {
        cb(null, socket)
      })
      socket.setTypeOfService = (p) => {
        priorities.push(p)
      }
      return socket
    }
  })
  after(() => client.close())
  after(() => server.close())

  const response = await client.request({
    path: '/',
    method: 'GET',
    typeOfService: 42
  })
  await response.body.text()

  const response2 = await client.request({
    path: '/',
    method: 'GET'
  })
  await response2.body.text()

  assert.deepStrictEqual(priorities, [42])
})

// https://github.com/nodejs/undici/issues/5544
// The default request path should not touch setsockopt on a fresh socket.
test('HTTP/1.1 Request Prioritization skips default ToS on fresh socket', async () => {
  let calls = 0

  const server = createServer((req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    connect: (opts, cb) => {
      const socket = net.connect({
        ...opts,
        host: opts.hostname,
        port: opts.port
      }, () => {
        cb(null, socket)
      })
      socket.setTypeOfService = () => {
        calls++
        throw new Error('setTypeOfService EINVAL')
      }
      return socket
    }
  })
  after(() => client.close())
  after(() => server.close())

  const response = await client.request({
    path: '/',
    method: 'GET'
  })
  await response.body.text()

  assert.strictEqual(calls, 0)
})

// https://github.com/nodejs/undici/issues/5544
// setTypeOfService() is best-effort and must not make the request fail.
test('HTTP/1.1 Request Prioritization ignores setTypeOfService errors', async () => {
  const priorities = []

  const server = createServer((req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    connect: (opts, cb) => {
      const socket = net.connect({
        ...opts,
        host: opts.hostname,
        port: opts.port
      }, () => {
        cb(null, socket)
      })
      socket.setTypeOfService = (p) => {
        priorities.push(p)
        throw new Error('setTypeOfService EINVAL')
      }
      return socket
    }
  })
  after(() => client.close())
  after(() => server.close())

  const response = await client.request({
    path: '/',
    method: 'GET',
    typeOfService: 42
  })

  assert.strictEqual(await response.body.text(), 'ok')
  assert.deepStrictEqual(priorities, [42])
})

test('HTTP/2 Connection Prioritization', async (t) => {
  const buildConnector = require('../lib/core/connect')

  let receivedHints = null
  // Mock net.connect
  t.mock.method(net, 'connect', (options) => {
    receivedHints = options.typeOfService

    const socket = new (require('node:events').EventEmitter)()
    socket.cork = () => { }
    socket.uncork = () => { }
    socket.destroy = () => { }
    socket.ref = () => { }
    socket.unref = () => { }
    socket.setKeepAlive = () => socket
    socket.setNoDelay = () => socket

    // Simulate connection to allow callback to fire
    process.nextTick(() => {
      socket.emit('connect')
    })

    return socket
  })

  // Test buildConnector directly to ensure options passing
  const connector = buildConnector({ typeOfService: 123, allowH2: true })

  await new Promise((resolve, reject) => {
    connector({ hostname: 'localhost', host: 'localhost', protocol: 'http:', port: 3000 }, (err, socket) => {
      if (err) reject(err)
      else resolve(socket)
    })
  })

  if (receivedHints !== 123) {
    throw new Error(`Expected typeOfService 123, got ${receivedHints}`)
  }
})
