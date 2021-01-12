'use strict'
/* global WeakRef, FinalizationRegistry */

const { test } = require('tap')
const { createServer } = require('net')
const { Client, Pool } = require('..')

const SKIP = typeof WeakRef === 'undefined' || typeof FinalizationRegistry === 'undefined'

setInterval(() => {
  global.gc()
}, 100).unref()

test('gc should collect the client if, and only if, there are no active sockets', { skip: SKIP }, t => {
  t.plan(4)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  let weakRef
  let disconnected = false

  const registry = new FinalizationRegistry((data) => {
    t.strictEqual(data, 'test')
    t.strictEqual(disconnected, true)
    t.strictEqual(weakRef.deref(), undefined)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeoutThreshold: 100
    })
    client.once('disconnect', () => {
      disconnected = true
    })

    weakRef = new WeakRef(client)
    registry.register(client, 'test')

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
  })
})

test('gc should collect the pool if, and only if, there are no active sockets', { skip: SKIP }, t => {
  t.plan(4)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  let weakRef
  let disconnected = false

  const registry = new FinalizationRegistry((data) => {
    t.strictEqual(data, 'test')
    t.strictEqual(disconnected, true)
    t.strictEqual(weakRef.deref(), undefined)
  })

  server.listen(0, () => {
    const pool = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      keepAliveTimeoutThreshold: 500
    })

    pool.once('disconnect', () => {
      disconnected = true
    })

    weakRef = new WeakRef(pool)
    registry.register(pool, 'test')

    pool.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
  })
})
