'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const EE = require('events')
const { kConnect } = require('../lib/core/symbols')
const { Readable } = require('stream')
const net = require('net')
const { promisify } = require('util')

test('request abort before headers', (t) => {
  t.plan(6)

  const signal = new EE()
  const server = createServer((req, res) => {
    res.end('hello')
    signal.emit('abort')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.type(err, errors.RequestAbortedError)
        t.equal(signal.listenerCount('abort'), 0)
      })
      t.equal(signal.listenerCount('abort'), 1)

      client.request({
        path: '/',
        method: 'GET',
        signal
      }, (err) => {
        t.type(err, errors.RequestAbortedError)
        t.equal(signal.listenerCount('abort'), 0)
      })
      t.equal(signal.listenerCount('abort'), 2)
    })
  })
})

test('request body destroyed on invalid callback', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const body = new Readable({
      read () {}
    })
    try {
      client.request({
        path: '/',
        method: 'GET',
        body
      }, null)
    } catch (err) {
      t.equal(body.destroyed, true)
    }
  })
})

test('trailers', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const { body, trailers } = await client.request({
      path: '/',
      method: 'GET'
    })

    body
      .on('data', () => t.fail())
      .on('end', () => {
        t.strictSame(trailers, { 'content-md5': 'test' })
      })
  })
})

test('destroy socket abruptly', async (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: close',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))

    // Unfortunately calling destroy synchronously might get us flaky results,
    // therefore we delay it to the next event loop run.
    setImmediate(socket.destroy.bind(socket))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { statusCode, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  t.equal(statusCode, 200)

  body.setEncoding('utf8')

  let actual = ''

  for await (const chunk of body) {
    actual += chunk
  }

  t.equal(actual, 'the body')
})

test('destroy socket abruptly with keep-alive', async (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    const lines = [
      'HTTP/1.1 200 OK',
      'Date: Sat, 09 Oct 2010 14:28:02 GMT',
      'Connection: keep-alive',
      'Content-Length: 42',
      '',
      'the body'
    ]
    socket.end(lines.join('\r\n'))

    // Unfortunately calling destroy synchronously might get us flaky results,
    // therefore we delay it to the next event loop run.
    setImmediate(socket.destroy.bind(socket))
  })
  t.teardown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { statusCode, body } = await client.request({
    path: '/',
    method: 'GET'
  })

  t.equal(statusCode, 200)

  body.setEncoding('utf8')

  try {
    /* eslint-disable */
    for await (const _ of body) {
      // empty on purpose
    }
    /* eslint-enable */
    t.fail('no error')
  } catch (err) {
    t.pass('error happened')
  }
})

test('request json', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(obj, await body.json())
  })
})

test('request text', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(JSON.stringify(obj), await body.text())
  })
})

test('request blob', (t) => {
  t.plan(2)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })

    const blob = await body.blob()
    t.strictSame(obj, JSON.parse(await blob.text()))
    t.equal(blob.type, 'application/json')
  })
})

test('request arrayBuffer', (t) => {
  t.plan(1)

  const obj = { asd: true }
  const server = createServer((req, res) => {
    res.end(JSON.stringify(obj))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const { body } = await client.request({
      path: '/',
      method: 'GET'
    })
    t.strictSame(Buffer.from(JSON.stringify(obj)), Buffer.from(await body.arrayBuffer()))
  })
})
