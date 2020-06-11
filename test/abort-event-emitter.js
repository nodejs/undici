'use strict'

const { test } = require('tap')
const EventEmitter = require('events')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { createReadStream } = require('fs')
const { Readable } = require('stream')

test('Abort before sending request (no body)', (t) => {
  t.plan(4)

  let count = 0
  const server = createServer((req, res) => {
    if (count === 1) {
      t.fail('The second request should never be executed')
    }
    count += 1
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    const body = new Readable({ read () { } })
    body.on('error', (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
    client.request({
      path: '/',
      method: 'GET',
      signal: ee,
      body
    }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })
})

test('Abort while waiting response (no body)', (t) => {
  t.plan(1)

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    ee.emit('abort')
    res.setHeader('content-type', 'text/plain')
    res.end('hello world')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })
})

test('Abort while waiting response (write headers started) (no body)', (t) => {
  t.plan(1)

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.flushHeaders()
    ee.emit('abort')
    res.end('hello world')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })
})

test('Abort while waiting response (write headers and write body started) (no body)', (t) => {
  t.plan(2)

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('hello')
    res.end('world')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      t.error(err)
      response.body.on('data', () => {
        ee.emit('abort')
      })
      response.body.on('error', err => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
})

function waitingWithBody (body, type) {
  test(`Abort while waiting response (with body ${type})`, (t) => {
    t.plan(1)

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      ee.emit('abort')
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
}

waitingWithBody('hello', 'string')
waitingWithBody(createReadStream(__filename), 'stream')
waitingWithBody(new Uint8Array([42]), 'Uint8Array')

function writeHeadersStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers started) (with body ${type})`, (t) => {
    t.plan(1)

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.flushHeaders()
      ee.emit('abort')
      res.end('hello world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
}

writeHeadersStartedWithBody('hello', 'string')
writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')

function writeBodyStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers and write body started) (with body ${type})`, (t) => {
    t.plan(2)

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
      res.end('world')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        t.error(err)
        response.body.on('data', () => {
          ee.emit('abort')
        })
        response.body.on('error', err => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
      })
    })
  })
}

writeBodyStartedWithBody('hello', 'string')
writeBodyStartedWithBody(createReadStream(__filename), 'stream')
writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
