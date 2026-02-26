'use strict'

const { test } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')

test('HTTP/1.1 Request Prioritization', async (t) => {
  let priority = null

  const server = createServer((req, res) => {
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, {
    connect: (opts, cb) => {
      const socket = require('node:net').connect({
        ...opts,
        host: opts.hostname,
        port: opts.port
      }, () => {
        cb(null, socket)
      })
      socket.setPriority = (p) => {
        priority = p
      }
      return socket
    }
  })

  try {
    await client.request({
      path: '/',
      method: 'GET',
      hints: 42
    })

    // Check if priority was set
    if (priority !== 42) {
      throw new Error(`Expected priority 42, got ${priority}`)
    }
  } finally {
    await client.close()
    server.close()
  }
})

test('HTTP/2 Connection Prioritization', async (t) => {
  const net = require('node:net')
  const buildConnector = require('../lib/core/connect')

  let receivedHints = null
  // Mock net.connect
  t.mock.method(net, 'connect', (options) => {
    receivedHints = options.hints

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
  const connector = buildConnector({ hints: 123, allowH2: true })

  await new Promise((resolve, reject) => {
    connector({ hostname: 'localhost', host: 'localhost', protocol: 'http:', port: 3000 }, (err, socket) => {
      if (err) reject(err)
      else resolve(socket)
    })
  })

  if (receivedHints !== 123) {
    throw new Error(`Expected hints 123, got ${receivedHints}`)
  }
})
