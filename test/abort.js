'use strict'

const { test } = require('tap')
const EventEmitter = require('events')
const { Client, errors } = require('..')
const { createServer } = require('http')

test('Abort while sending request - event emitter (no body)', { skip: 'never ending' }, (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    t.fail('The requets should be aborted')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })
})

test('Abort while waiting response - event emitter (no body)', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    setTimeout(() => {
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    }, 1000)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 500)
  })
})

test('Abort while waiting response - event emitter (write headers started) (no body)', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    setTimeout(() => {
      res.end('hello world')
    }, 1000)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 500)
  })
})

test('Abort while waiting response - event emitter (write headers (write body started) (no body)', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('hello')
    setTimeout(() => {
      res.end('world')
    }, 1000)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    setTimeout(() => {
      ee.emit('abort')
    }, 500)
  })
})
