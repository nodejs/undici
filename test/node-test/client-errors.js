'use strict'

const assert = require('node:assert')
const https = require('node:https')
const net = require('node:net')
const { Readable } = require('node:stream')
const { test, after } = require('node:test')
const { Client, Pool, errors } = require('../..')
const { createServer } = require('node:http')
const pem = require('https-pem')
const { tspl } = require('@matteo.collina/tspl')

const { kSocket } = require('../../lib/core/symbols')
const { wrapWithAsyncIterable, maybeWrapStream, consts } = require('../utils/async-iterators')

const { closeServerAsPromise } = require('../utils/node-http')

class IteratorError extends Error {}

test('GET errors and reconnect with pipelining 1', async (t) => {
  const p = tspl(t, { plan: 9 })

  const server = createServer()

  server.once('request', (req, res) => {
    // first request received, destroying
    p.ok(1)
    res.socket.destroy()

    server.once('request', (req, res) => {
      p.strictEqual('/', req.url)
      p.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
      p.ok(err instanceof Error) // we are expecting an error
      p.strictEqual(data.opaque, 'asd')
    })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      p.strictEqual(statusCode, 200)
      p.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await p.completed
})

test('GET errors and reconnect with pipelining 3', async (t) => {
  const server = createServer()
  const requestsThatWillError = 3
  let requests = 0

  const p = tspl(t, { plan: 6 + requestsThatWillError * 3 })

  server.on('request', (req, res) => {
    if (requests++ < requestsThatWillError) {
      // request received, destroying
      p.ok(1)

      // socket might not be there if it was destroyed by another
      // pipelined request
      if (res.socket) {
        res.socket.destroy()
      }
    } else {
      p.strictEqual('/', req.url)
      p.strictEqual('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    }
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.after(client.destroy.bind(client))

    // all of these will error
    for (let i = 0; i < 3; i++) {
      client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
        p.ok(err instanceof Error) // we are expecting an error
        p.strictEqual(data.opaque, 'asd')
      })
    }

    // this will be queued up
    client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      p.strictEqual(statusCode, 200)
      p.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await p.completed
})

function errorAndPipelining (type) {
  test(`POST with a ${type} that errors and pipelining 1 should reconnect`, async (t) => {
    const p = tspl(t, { plan: 12 })

    const server = createServer()
    server.once('request', (req, res) => {
      p.strictEqual('/', req.url)
      p.strictEqual('POST', req.method)
      p.strictEqual('42', req.headers['content-length'])

      const bufs = []
      req.on('data', (buf) => {
        bufs.push(buf)
      })

      req.on('aborted', () => {
        // we will abruptly close the connection here
        // but this will still end
        p.strictEqual('a string', Buffer.concat(bufs).toString('utf8'))
      })

      server.once('request', (req, res) => {
        p.strictEqual('/', req.url)
        p.strictEqual('GET', req.method)
        res.setHeader('content-type', 'text/plain')
        res.end('hello')
      })
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({
        path: '/',
        method: 'POST',
        headers: {
          // higher than the length of the string
          'content-length': 42
        },
        opaque: 'asd',
        body: maybeWrapStream(new Readable({
          read () {
            this.push('a string')
            this.destroy(new Error('kaboom'))
          }
        }), type)
      }, (err, data) => {
        p.strictEqual(err.message, 'kaboom')
        p.strictEqual(data.opaque, 'asd')
      })

      // this will be queued up
      client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.strictEqual(statusCode, 200)
        p.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })

    await p.completed
  })
}

errorAndPipelining(consts.STREAM)
errorAndPipelining(consts.ASYNC_ITERATOR)

function errorAndChunkedEncodingPipelining (type) {
  test(`POST with chunked encoding, ${type} body that errors and pipelining 1 should reconnect`, async (t) => {
    const p = tspl(t, { plan: 12 })

    const server = createServer()
    server.once('request', (req, res) => {
      p.strictEqual('/', req.url)
      p.strictEqual('POST', req.method)
      p.strictEqual(req.headers['content-length'], undefined)

      const bufs = []
      req.on('data', (buf) => {
        bufs.push(buf)
      })

      req.on('aborted', () => {
        // we will abruptly close the connection here
        // but this will still end
        p.strictEqual('a string', Buffer.concat(bufs).toString('utf8'))
      })

      server.once('request', (req, res) => {
        p.strictEqual('/', req.url)
        p.strictEqual('GET', req.method)
        res.setHeader('content-type', 'text/plain')
        res.end('hello')
      })
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      client.request({
        path: '/',
        method: 'POST',
        opaque: 'asd',
        body: maybeWrapStream(new Readable({
          read () {
            this.push('a string')
            this.destroy(new Error('kaboom'))
          }
        }), type)
      }, (err, data) => {
        p.strictEqual(err.message, 'kaboom')
        p.strictEqual(data.opaque, 'asd')
      })

      // this will be queued up
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        p.ifError(err)
        p.strictEqual(statusCode, 200)
        p.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          p.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
    await p.completed
  })
}

errorAndChunkedEncodingPipelining(consts.STREAM)
errorAndChunkedEncodingPipelining(consts.ASYNC_ITERATOR)

test('invalid options throws', (t, done) => {
  try {
    new Client({ port: 'foobar', protocol: 'https:' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'Invalid URL: port must be a valid integer or a string representation of an integer.')
  }

  try {
    new Client(new URL('http://asd:200/somepath')) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200?q=asd')) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200#asd')) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      socketPath: 1
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid socketPath')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeout: 'asd'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid keepAliveTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      localAddress: 123
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'localAddress must be valid string IP address')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      localAddress: 'abcd123'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'localAddress must be valid string IP address')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 'asd'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 0
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeoutThreshold: 'asd'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid keepAliveTimeoutThreshold')
  }

  try {
    new Client({ // eslint-disable-line
      protocol: 'asd'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'Invalid URL protocol: the URL must start with `http:` or `https:`.')
  }

  try {
    new Client({ // eslint-disable-line
      hostname: 1
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'Invalid URL hostname: the hostname must be a string or null/undefined.')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 'asd'
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 0
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 0
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: -10
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 1.5
    })
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(1) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'Invalid URL: The URL argument must be a non-null object.')
  }

  try {
    const client = new Client(new URL('http://localhost:200'))
    client.destroy(null, null)
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid callback')
  }

  try {
    const client = new Client(new URL('http://localhost:200'))
    client.close(null, null)
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid callback')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxKeepAliveTimeout: 1e3 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { keepAlive: false }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'unsupported keepAlive, use pipelining=0 instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { idleTimeout: 30e3 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'unsupported idleTimeout, use keepAliveTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { socketTimeout: 30e3 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'unsupported socketTimeout, use headersTimeout & bodyTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { requestTimeout: 30e3 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'unsupported requestTimeout, use headersTimeout & bodyTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: -1 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: Infinity }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: 'asd' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connect: 'asd' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'connect must be a function or an object')
  }

  try {
    new Client(new URL('http://localhost:200'), { connect: -1 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'connect must be a function or an object')
  }

  try {
    new Pool(new URL('http://localhost:200'), { connect: 'asd' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'connect must be a function or an object')
  }

  try {
    new Pool(new URL('http://localhost:200'), { connect: -1 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'connect must be a function or an object')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxCachedSessions: -10 }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'maxCachedSessions must be a positive integer or zero')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxCachedSessions: 'foo' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'maxCachedSessions must be a positive integer or zero')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxRequestsPerClient: 'foo' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'maxRequestsPerClient must be a positive number')
  }

  try {
    new Client(new URL('http://localhost:200'), { autoSelectFamilyAttemptTimeout: 'foo' }) // eslint-disable-line
    assert.ok(0)
  } catch (err) {
    assert.ok(err instanceof errors.InvalidArgumentError)
    assert.strictEqual(err.message, 'autoSelectFamilyAttemptTimeout must be a positive number')
  }

  done()
})

test('POST which fails should error response', async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = createServer()
  server.on('request', (req, res) => {
    req.once('data', () => {
      res.destroy()
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    function checkError (err) {
      // Different platforms error with different codes...
      p.ok(
        err.code === 'EPIPE' ||
        err.code === 'ECONNRESET' ||
        err.code === 'UND_ERR_SOCKET' ||
        err.message === 'other side closed'
      )
    }

    {
      const body = new Readable({ read () {} })
      body.push('asd')
      body.on('error', (err) => {
        checkError(err)
      })

      client.request({
        path: '/',
        method: 'POST',
        body
      }, (err) => {
        checkError(err)
      })
    }

    {
      const body = new Readable({ read () {} })
      body.push('asd')
      body.on('error', (err) => {
        checkError(err)
      })

      client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': 100
        },
        body
      }, (err) => {
        checkError(err)
      })
    }

    {
      const body = wrapWithAsyncIterable(['asd'], true)

      client.request({
        path: '/',
        method: 'POST',
        body
      }, (err) => {
        checkError(err)
      })
    }

    {
      const body = wrapWithAsyncIterable(['asd'], true)

      client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-length': 100
        },
        body
      }, (err) => {
        checkError(err)
      })
    }
  })

  await p.completed
})

test('client destroy cleanup', async (t) => {
  const p = tspl(t, { plan: 3 })

  const _err = new Error('kaboom')
  let client
  const server = createServer()
  server.once('request', (req, res) => {
    req.once('data', () => {
      client.destroy(_err, (err) => {
        p.ifError(err)
      })
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    const body = new Readable({ read () {} })
    body.push('asd')
    body.on('error', (err) => {
      p.strictEqual(err, _err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, data) => {
      p.strictEqual(err, _err)
    })
  })

  await p.completed
})

test('throwing async-iterator causes error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({
      method: 'POST',
      path: '/',
      body: (async function * () {
        yield 'hello'
        throw new IteratorError('bad iterator')
      })()
    }, (err) => {
      p.ok(err instanceof IteratorError)
    })
  })

  await p.completed
})

test('client async-iterator destroy cleanup', async (t) => {
  const p = tspl(t, { plan: 2 })

  const _err = new Error('kaboom')
  let client
  const server = createServer()
  server.once('request', (req, res) => {
    req.once('data', () => {
      client.destroy(_err, (err) => {
        p.ifError(err)
      })
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    const body = wrapWithAsyncIterable(['asd'], true)

    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, data) => {
      p.strictEqual(err, _err)
    })
  })

  await p.completed
})

test('GET errors body', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer()
  server.once('request', (req, res) => {
    res.write('asd')
    setTimeout(() => {
      res.destroy()
    }, 19)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      p.ifError(err)
      body.resume()
      body.on('error', err => (
        p.ok(err)
      ))
    })
  })

  await p.completed
})

test('validate request body', async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    client.request({
      path: '/',
      method: 'POST',
      body: /asdasd/
    }, (err, data) => {
      p.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: 0
    }, (err, data) => {
      p.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: false
    }, (err, data) => {
      p.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: ''
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Uint8Array()
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: Buffer.alloc(10)
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
    })
  })

  await p.completed
})

function socketFailWrite (type) {
  test(`socket fail while writing ${type} request body`, async (t) => {
    const p = tspl(t, { plan: 2 })

    const server = createServer()
    server.once('request', (req, res) => {
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.after(client.destroy.bind(client))

      const preBody = new Readable({ read () {} })
      preBody.push('asd')
      const body = maybeWrapStream(preBody, type)
      client.on('connect', () => {
        process.nextTick(() => {
          client[kSocket].destroy('kaboom')
        })
      })

      client.request({
        path: '/',
        method: 'POST',
        body
      }, (err) => {
        p.ok(err)
      })
      client.close((err) => {
        p.ifError(err)
      })
    })

    await p.completed
  })
}
socketFailWrite(consts.STREAM)
socketFailWrite(consts.ASYNC_ITERATOR)

function socketFailEndWrite (type) {
  test(`socket fail while ending ${type} request body`, async (t) => {
    const p = tspl(t, { plan: 3 })

    const server = createServer()
    server.once('request', (req, res) => {
      res.end()
    })
    t.after(closeServerAsPromise(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 2
      })
      t.after(client.destroy.bind(client))

      const _err = new Error('kaboom')
      client.on('connect', () => {
        process.nextTick(() => {
          client[kSocket].destroy(_err)
        })
      })
      const preBody = new Readable({ read () {} })
      preBody.push(null)
      const body = maybeWrapStream(preBody, type)

      client.request({
        path: '/',
        method: 'POST',
        body
      }, (err) => {
        p.strictEqual(err, _err)
      })
      client.close((err) => {
        p.ifError(err)
        client.close((err) => {
          p.ok(err instanceof errors.ClientDestroyedError)
        })
      })
    })

    await p.completed
  })
}

socketFailEndWrite(consts.STREAM)
socketFailEndWrite(consts.ASYNC_ITERATOR)

test('queued request should not fail on socket destroy', async (t) => {
  const p = tspl(t, { plan: 4 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.after(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      data.body.resume().on('error', () => {
        p.ok(1)
      })
      client[kSocket].destroy()
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        p.ifError(err)
        data.body.resume().on('end', () => {
          p.ok(1)
        })
      })
    })
  })

  await p.completed
})

test('queued request should fail on client destroy', async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.after(client.destroy.bind(client))

    let requestErrored = false
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
        .on('error', () => {
          p.ok(1)
        })
      client.destroy((err) => {
        p.ifError(err)
        p.strictEqual(requestErrored, true)
      })
    })
    client.request({
      path: '/',
      method: 'GET',
      opaque: 'asd'
    }, (err, data) => {
      requestErrored = true
      p.ok(err)
      p.strictEqual(data.opaque, 'asd')
    })
  })

  await p.completed
})

test('retry idempotent inflight', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.after(() => { return client.close() })

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err) => {
      p.ok(err)
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      data.body.resume()
    })
  })

  await p.completed
})

test('invalid opts', async (t) => {
  const p = tspl(t, { plan: 5 })

  const client = new Client('http://localhost:5000')
  client.request(null, (err) => {
    p.ok(err instanceof errors.InvalidArgumentError)
  })
  client.pipeline(null).on('error', (err) => {
    p.ok(err instanceof errors.InvalidArgumentError)
  })
  client.request({
    path: '/',
    method: 'GET',
    highWaterMark: '1000'
  }, (err) => {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'invalid highWaterMark')
  })
  client.request({
    path: '/',
    method: 'GET',
    highWaterMark: -1
  }, (err) => {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'invalid highWaterMark')
  })

  await p.completed
})

test('default port for http and https', async (t) => {
  const p = tspl(t, { plan: 4 })

  try {
    new Client(new URL('http://localhost:80')) // eslint-disable-line
    p.ok('Should not throw')
  } catch (err) {
    p.fail(err)
  }

  try {
    new Client(new URL('http://localhost')) // eslint-disable-line
    p.ok('Should not throw')
  } catch (err) {
    p.fail(err)
  }

  try {
    new Client(new URL('https://localhost:443')) // eslint-disable-line
    p.ok('Should not throw')
  } catch (err) {
    p.fail(err)
  }

  try {
    new Client(new URL('https://localhost')) // eslint-disable-line
    p.ok('Should not throw')
  } catch (err) {
    p.fail(err)
  }
})

test('CONNECT throws in next tick', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      data.body
        .on('end', () => {
          let ticked = false
          client.request({
            path: '/',
            method: 'CONNECT'
          }, (err) => {
            p.ok(err)
            p.strictEqual(ticked, true)
          })
          ticked = true
        })
        .resume()
    })
  })

  await p.completed
})

test('invalid signal', async (t) => {
  const p = tspl(t, { plan: 8 })

  const client = new Client('http://localhost:3333')
  t.after(client.destroy.bind(client))

  let ticked = false
  client.request({ path: '/', method: 'GET', signal: {}, opaque: 'asd' }, (err, { opaque }) => {
    p.strictEqual(ticked, true)
    p.strictEqual(opaque, 'asd')
    p.ok(err instanceof errors.InvalidArgumentError)
  })
  client.pipeline({ path: '/', method: 'GET', signal: {} }, () => {})
    .on('error', (err) => {
      p.strictEqual(ticked, true)
      p.ok(err instanceof errors.InvalidArgumentError)
    })
  client.stream({ path: '/', method: 'GET', signal: {}, opaque: 'asd' }, () => {}, (err, { opaque }) => {
    p.strictEqual(ticked, true)
    p.strictEqual(opaque, 'asd')
    p.ok(err instanceof errors.InvalidArgumentError)
  })
  ticked = true

  await p.completed
})

test('invalid body chunk does not crash', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({
      path: '/',
      body: new Readable({
        objectMode: true,
        read () {
          this.push({})
        }
      }),
      method: 'GET'
    }, (err) => {
      p.strictEqual(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })

  await p.completed
})

test('socket errors', async (t) => {
  const p = tspl(t, { plan: 2 })
  const client = new Client('http://localhost:5554')
  t.after(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    p.ok(err)
    // TODO: Why UND_ERR_SOCKET?
    p.ok(err.code === 'ECONNREFUSED' || err.code === 'UND_ERR_SOCKET', err.code)
    p.end()
  })

  await p.completed
})

test('headers overflow', (t, done) => {
  const p = tspl(t, { plan: 2 })
  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(200, {
      'x-test-1': '1',
      'x-test-2': '2'
    })
    res.end()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      maxHeaderSize: 10
    })
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      p.ok(err)
      p.strictEqual(err.code, 'UND_ERR_HEADERS_OVERFLOW')
      done()
    })
  })
})

test('SocketError should expose socket details (net)', async (t) => {
  const p = tspl(t, { plan: 8 })

  const server = createServer()

  server.once('request', (req, res) => {
    res.destroy()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      p.ok(err instanceof errors.SocketError)
      if (err.socket.remoteFamily === 'IPv4') {
        p.strictEqual(err.socket.remoteFamily, 'IPv4')
        p.strictEqual(err.socket.localAddress, '127.0.0.1')
        p.strictEqual(err.socket.remoteAddress, '127.0.0.1')
      } else {
        p.strictEqual(err.socket.remoteFamily, 'IPv6')
        p.strictEqual(err.socket.localAddress, '::1')
        p.strictEqual(err.socket.remoteAddress, '::1')
      }
      p.ok(typeof err.socket.localPort === 'number')
      p.ok(typeof err.socket.remotePort === 'number')
      p.ok(typeof err.socket.bytesWritten === 'number')
      p.ok(typeof err.socket.bytesRead === 'number')
    })
  })
  await p.completed
})

test('SocketError should expose socket details (tls)', async (t) => {
  const p = tspl(t, { plan: 8 })

  const server = https.createServer(pem)

  server.once('request', (req, res) => {
    res.destroy()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    t.after(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      p.ok(err instanceof errors.SocketError)
      if (err.socket.remoteFamily === 'IPv4') {
        p.strictEqual(err.socket.remoteFamily, 'IPv4')
        p.strictEqual(err.socket.localAddress, '127.0.0.1')
        p.strictEqual(err.socket.remoteAddress, '127.0.0.1')
      } else {
        p.strictEqual(err.socket.remoteFamily, 'IPv6')
        p.strictEqual(err.socket.localAddress, '::1')
        p.strictEqual(err.socket.remoteAddress, '::1')
      }
      p.ok(typeof err.socket.localPort === 'number')
      p.ok(typeof err.socket.remotePort === 'number')
      p.ok(typeof err.socket.bytesWritten === 'number')
      p.ok(typeof err.socket.bytesRead === 'number')
    })
  })

  await p.completed
})

test('parser error', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer()
  server.once('connection', (socket) => {
    socket.write('asd\n\r213123')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err)
      client.close((err) => {
        t.ifError(err)
      })
    })
  })

  await t.completed
})
