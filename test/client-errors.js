'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { Readable } = require('readable-stream')

test('GET errors and reconnect with pipelining 1', (t) => {
  t.plan(9)

  const server = createServer()

  server.once('request', (req, res) => {
    t.pass('first request received, destroying')
    res.socket.destroy()

    server.once('request', (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ok(err instanceof Error) // we are expecting an error
      t.strictEqual(null, data)
    })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('GET errors and reconnect with pipelining 3', (t) => {
  const server = createServer()
  const requestsThatWillError = 3
  let requests = 0

  t.plan(6 + requestsThatWillError * 3)

  server.on('request', (req, res) => {
    if (requests++ < requestsThatWillError) {
      t.pass('request received, destroying')

      // socket might not be there if it was destroyed by another
      // pipelined request
      if (res.socket) {
        res.socket.destroy()
      }
    } else {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    }
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.close.bind(client))

    // all of these will error
    for (let i = 0; i < 3; i++) {
      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ok(err instanceof Error) // we are expecting an error
        t.strictEqual(null, data)
      })
    }

    // this will be queued up
    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('POST with a stream that errors and pipelining 1 should reconnect', (t) => {
  t.plan(12)

  const server = createServer()
  server.once('request', (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('POST', req.method)
    t.strictEqual('42', req.headers['content-length'])

    const bufs = []
    req.on('data', (buf) => {
      bufs.push(buf)
    })
    // req.socket.on('end', console.log.bind(console, 'end'))

    req.on('aborted', () => {
      // we will abruptly close the connection here
      // but this will still end
      t.strictEqual('a string', Buffer.concat(bufs).toString('utf8'))
    })

    server.once('request', (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        // higher than the length of the string
        'content-length': 42
      },
      body: new Readable({
        read () {
          this.push('a string')
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
      t.strictEqual(data, null)
    })

    // this will be queued up
    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('POST with chunked encoding that errors and pipelining 1 should reconnect', (t) => {
  t.plan(12)

  const server = createServer()
  server.once('request', (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('POST', req.method)
    t.strictEqual(req.headers['content-length'], undefined)

    const bufs = []
    req.on('data', (buf) => {
      bufs.push(buf)
    })
    // req.socket.on('end', console.log.bind(console, 'end'))

    req.on('aborted', () => {
      // we will abruptly close the connection here
      // but this will still end
      t.strictEqual('a string', Buffer.concat(bufs).toString('utf8'))
    })

    server.once('request', (req, res) => {
      t.strictEqual('/', req.url)
      t.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.push('a string')
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
      t.strictEqual(data, null)
    })

    // this will be queued up
    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})
