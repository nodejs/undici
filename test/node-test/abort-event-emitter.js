'use strict'

const { test } = require('node:test')
const EventEmitter = require('node:events')
const { Client, errors } = require('../..')
const { createServer } = require('node:http')
const { createReadStream } = require('node:fs')
const { Readable } = require('node:stream')
const { tspl } = require('@matteo.collina/tspl')
const { wrapWithAsyncIterable } = require('../utils/async-iterators')
const { closeServerAsPromise } = require('../utils/node-http')

test('Abort before sending request (no body)', async (t) => {
  const p = tspl(t, { plan: 4 })

  let count = 0
  const server = createServer((req, res) => {
    if (count === 1) {
      p.fail('The second request should never be executed')
    }
    count += 1
    res.end('hello')
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      p.ifError(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    const body = new Readable({ read () { } })
    body.on('error', (err) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })
    client.request({
      path: '/',
      method: 'GET',
      signal: ee,
      body
    }, (err, response) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })

  await p.completed
})

test('Abort before sending request (no body) async iterator', async (t) => {
  const p = tspl(t, { plan: 3 })

  let count = 0
  const server = createServer((req, res) => {
    if (count === 1) {
      t.fail('The second request should never be executed')
    }
    count += 1
    res.end('hello')
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const ee = new EventEmitter()
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, response) => {
      p.ifError(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })

    const body = wrapWithAsyncIterable(new Readable({ read () { } }))
    client.request({
      path: '/',
      method: 'GET',
      signal: ee,
      body
    }, (err, response) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })

    ee.emit('abort')
  })

  await p.completed
})

test('Abort while waiting response (no body)', async (t) => {
  const p = tspl(t, { plan: 1 })

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    ee.emit('abort')
    res.setHeader('content-type', 'text/plain')
    res.end('hello world')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })
  })

  await p.completed
})

test('Abort while waiting response (write headers started) (no body)', async (t) => {
  const p = tspl(t, { plan: 1 })

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.flushHeaders()
    ee.emit('abort')
    res.end('hello world')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      p.ok(err instanceof errors.RequestAbortedError)
    })
  })

  await p.completed
})

test('Abort while waiting response (write headers and write body started) (no body)', async (t) => {
  const p = tspl(t, { plan: 2 })

  const ee = new EventEmitter()
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.write('hello')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', signal: ee }, (err, response) => {
      p.ifError(err)
      response.body.on('data', () => {
        ee.emit('abort')
      })
      response.body.on('error', err => {
        p.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })
  await p.completed
})

function waitingWithBody (body, type) {
  test(`Abort while waiting response (with body ${type})`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      ee.emit('abort')
      res.setHeader('content-type', 'text/plain')
      res.end('hello world')
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError)
      })
    })
    await p.completed
  })
}

waitingWithBody('hello', 'string')
waitingWithBody(createReadStream(__filename), 'stream')
waitingWithBody(new Uint8Array([42]), 'Uint8Array')
waitingWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

function writeHeadersStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers started) (with body ${type})`, async (t) => {
    const p = tspl(t, { plan: 1 })

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.flushHeaders()
      ee.emit('abort')
      res.end('hello world')
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        p.ok(err instanceof errors.RequestAbortedError)
      })
    })
    await p.completed
  })
}

writeHeadersStartedWithBody('hello', 'string')
writeHeadersStartedWithBody(createReadStream(__filename), 'stream')
writeHeadersStartedWithBody(new Uint8Array([42]), 'Uint8Array')
writeHeadersStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')

function writeBodyStartedWithBody (body, type) {
  test(`Abort while waiting response (write headers and write body started) (with body ${type})`, async (t) => {
    const p = tspl(t, { plan: 2 })

    const ee = new EventEmitter()
    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.write('hello')
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({ path: '/', method: 'POST', body, signal: ee }, (err, response) => {
        p.ifError(err)
        response.body.on('data', () => {
          ee.emit('abort')
        })
        response.body.on('error', err => {
          p.ok(err instanceof errors.RequestAbortedError)
        })
      })
    })
    await p.completed
  })
}

writeBodyStartedWithBody('hello', 'string')
writeBodyStartedWithBody(createReadStream(__filename), 'stream')
writeBodyStartedWithBody(new Uint8Array([42]), 'Uint8Array')
writeBodyStartedWithBody(wrapWithAsyncIterable(createReadStream(__filename)), 'async-iterator')
