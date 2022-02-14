'use strict'

const { test } = require('tap')
const { Client, Pool, errors } = require('..')
const { createServer } = require('http')
const https = require('https')
const pem = require('https-pem')
const net = require('net')
const { Readable } = require('stream')

const { kSocket } = require('../lib/core/symbols')
const { wrapWithAsyncIterable, maybeWrapStream, consts } = require('./utils/async-iterators')

class IteratorError extends Error {}

test('GET errors and reconnect with pipelining 1', (t) => {
  t.plan(9)

  const server = createServer()

  server.once('request', (req, res) => {
    t.pass('first request received, destroying')
    res.socket.destroy()

    server.once('request', (req, res) => {
      t.equal('/', req.url)
      t.equal('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
      t.type(err, Error) // we are expecting an error
      t.equal(data.opaque, 'asd')
    })

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
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
      t.equal('/', req.url)
      t.equal('GET', req.method)
      res.setHeader('content-type', 'text/plain')
      res.end('hello')
    }
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.destroy.bind(client))

    // all of these will error
    for (let i = 0; i < 3; i++) {
      client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
        t.type(err, Error) // we are expecting an error
        t.equal(data.opaque, 'asd')
      })
    }

    // this will be queued up
    client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

function errorAndPipelining (type) {
  test(`POST with a ${type} that errors and pipelining 1 should reconnect`, (t) => {
    t.plan(12)

    const server = createServer()
    server.once('request', (req, res) => {
      t.equal('/', req.url)
      t.equal('POST', req.method)
      t.equal('42', req.headers['content-length'])

      const bufs = []
      req.on('data', (buf) => {
        bufs.push(buf)
      })

      req.on('aborted', () => {
        // we will abruptly close the connection here
        // but this will still end
        t.equal('a string', Buffer.concat(bufs).toString('utf8'))
      })

      server.once('request', (req, res) => {
        t.equal('/', req.url)
        t.equal('GET', req.method)
        res.setHeader('content-type', 'text/plain')
        res.end('hello')
      })
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

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
        t.equal(err.message, 'kaboom')
        t.equal(data.opaque, 'asd')
      })

      // this will be queued up
      client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })
}

errorAndPipelining(consts.STREAM)
errorAndPipelining(consts.ASYNC_ITERATOR)

function errorAndChunkedEncodingPipelining (type) {
  test(`POST with chunked encoding, ${type} body that errors and pipelining 1 should reconnect`, (t) => {
    t.plan(12)

    const server = createServer()
    server.once('request', (req, res) => {
      t.equal('/', req.url)
      t.equal('POST', req.method)
      t.equal(req.headers['content-length'], undefined)

      const bufs = []
      req.on('data', (buf) => {
        bufs.push(buf)
      })

      req.on('aborted', () => {
        // we will abruptly close the connection here
        // but this will still end
        t.equal('a string', Buffer.concat(bufs).toString('utf8'))
      })

      server.once('request', (req, res) => {
        t.equal('/', req.url)
        t.equal('GET', req.method)
        res.setHeader('content-type', 'text/plain')
        res.end('hello')
      })
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

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
        t.equal(err.message, 'kaboom')
        t.equal(data.opaque, 'asd')
      })

      // this will be queued up
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        t.equal(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
      })
    })
  })
}

errorAndChunkedEncodingPipelining(consts.STREAM)
errorAndChunkedEncodingPipelining(consts.ASYNC_ITERATOR)

test('invalid options throws', (t) => {
  try {
    new Client({ port: 'foobar' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid port')
  }

  try {
    new Client(new URL('http://asd:200/somepath')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200?q=asd')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200#asd')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      socketPath: 1
    })
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid socketPath')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeout: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid keepAliveTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 0
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeoutThreshold: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid keepAliveTimeoutThreshold')
  }

  try {
    new Client({ // eslint-disable-line
      protocol: 'asd'
    })
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid protocol')
  }

  try {
    new Client({ // eslint-disable-line
      hostname: 1
    })
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid hostname')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 'asd'
    })
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(1) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid url')
  }

  try {
    const client = new Client(new URL('http://localhost:200')) // eslint-disable-line
    client.destroy(null, null)
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid callback')
  }

  try {
    const client = new Client(new URL('http://localhost:200')) // eslint-disable-line
    client.close(null, null)
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid callback')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxKeepAliveTimeout: 1e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { keepAlive: false }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'unsupported keepAlive, use pipelining=0 instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { idleTimeout: 30e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'unsupported idleTimeout, use keepAliveTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { socketTimeout: 30e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'unsupported socketTimeout, use headersTimeout & bodyTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { requestTimeout: 30e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'unsupported requestTimeout, use headersTimeout & bodyTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: -1 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: Infinity }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connectTimeout: 'asd' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid connectTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { connect: 'asd' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'connect must be a function or an object')
  }

  try {
    new Client(new URL('http://localhost:200'), { connect: -1 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'connect must be a function or an object')
  }

  try {
    new Pool(new URL('http://localhost:200'), { connect: 'asd' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'connect must be a function or an object')
  }

  try {
    new Pool(new URL('http://localhost:200'), { connect: -1 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'connect must be a function or an object')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxCachedSessions: -10 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'maxCachedSessions must be a positive integer or zero')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxCachedSessions: 'foo' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'maxCachedSessions must be a positive integer or zero')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxRequestsPerClient: 'foo' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'maxRequestsPerClient must be a positive number')
  }

  t.end()
})

test('POST which fails should error response', (t) => {
  t.plan(6)

  const server = createServer()
  server.on('request', (req, res) => {
    req.once('data', () => {
      res.destroy()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    function checkError (err) {
      // Different platforms error with different codes...
      t.ok(
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
})

test('client destroy cleanup', (t) => {
  t.plan(3)

  const _err = new Error('kaboom')
  let client
  const server = createServer()
  server.once('request', (req, res) => {
    req.once('data', () => {
      client.destroy(_err, (err) => {
        t.error(err)
      })
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const body = new Readable({ read () {} })
    body.push('asd')
    body.on('error', (err) => {
      t.equal(err, _err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, data) => {
      t.equal(err, _err)
    })
  })
})

test('throwing async-iterator causes error', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      method: 'POST',
      path: '/',
      body: (async function * () {
        yield 'hello'
        throw new IteratorError('bad iterator')
      })()
    }, (err) => {
      t.type(err, IteratorError)
    })
  })
})

test('client async-iterator destroy cleanup', (t) => {
  t.plan(2)

  const _err = new Error('kaboom')
  let client
  const server = createServer()
  server.once('request', (req, res) => {
    req.once('data', () => {
      client.destroy(_err, (err) => {
        t.error(err)
      })
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const body = wrapWithAsyncIterable(['asd'], true)

    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, data) => {
      t.equal(err, _err)
    })
  })
})

test('GET errors body', (t) => {
  t.plan(2)

  const server = createServer()
  server.once('request', (req, res) => {
    res.write('asd')
    setTimeout(() => {
      res.destroy()
    }, 19)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.resume()
      body.on('error', err => (
        t.ok(err)
      ))
    })
  })
})

test('validate request body', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: /asdasd/
    }, (err, data) => {
      t.type(err, errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: 0
    }, (err, data) => {
      t.type(err, errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: false
    }, (err, data) => {
      t.type(err, errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: ''
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Uint8Array()
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: Buffer.alloc(10)
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})

test('parser error', (t) => {
  t.plan(2)

  const server = net.createServer()
  server.once('connection', (socket) => {
    socket.write('asd\n\r213123')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err)
      client.close((err) => {
        t.error(err)
      })
    })
  })
})

function socketFailWrite (type) {
  test(`socket fail while writing ${type} request body`, (t) => {
    t.plan(2)

    const server = createServer()
    server.once('request', (req, res) => {
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.destroy.bind(client))

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
        t.ok(err)
      })
      client.close((err) => {
        t.error(err)
      })
    })
  })
}
socketFailWrite(consts.STREAM)
socketFailWrite(consts.ASYNC_ITERATOR)

function socketFailEndWrite (type) {
  test(`socket fail while ending ${type} request body`, (t) => {
    t.plan(3)

    const server = createServer()
    server.once('request', (req, res) => {
      res.end()
    })
    t.teardown(server.close.bind(server))

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        pipelining: 2
      })
      t.teardown(client.destroy.bind(client))

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
        t.equal(err, _err)
      })
      client.close((err) => {
        t.error(err)
        client.close((err) => {
          t.type(err, errors.ClientDestroyedError)
        })
      })
    })
  })
}

socketFailEndWrite(consts.STREAM)
socketFailEndWrite(consts.ASYNC_ITERATOR)

test('queued request should not fail on socket destroy', (t) => {
  t.plan(4)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('error', () => {
        t.pass()
      })
      client[kSocket].destroy()
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.resume().on('end', () => {
          t.pass()
        })
      })
    })
  })
})

test('queued request should fail on client destroy', (t) => {
  t.plan(6)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.teardown(client.destroy.bind(client))

    let requestErrored = false
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
        .on('error', () => {
          t.pass()
        })
      client.destroy((err) => {
        t.error(err)
        t.equal(requestErrored, true)
      })
    })
    client.request({
      path: '/',
      method: 'GET',
      opaque: 'asd'
    }, (err, data) => {
      requestErrored = true
      t.ok(err)
      t.equal(data.opaque, 'asd')
    })
  })
})

test('retry idempotent inflight', (t) => {
  t.plan(3)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: new Readable({
        read () {
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err) => {
      t.ok(err)
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})

test('invalid opts', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')
  client.request(null, (err) => {
    t.type(err, errors.InvalidArgumentError)
  })
  client.pipeline(null).on('error', (err) => {
    t.type(err, errors.InvalidArgumentError)
  })
})

test('default port for http and https', (t) => {
  t.plan(4)

  try {
    new Client(new URL('http://localhost:80')) // eslint-disable-line
    t.pass('Should not throw')
  } catch (err) {
    t.fail(err)
  }

  try {
    new Client(new URL('http://localhost')) // eslint-disable-line
    t.pass('Should not throw')
  } catch (err) {
    t.fail(err)
  }

  try {
    new Client(new URL('https://localhost:443')) // eslint-disable-line
    t.pass('Should not throw')
  } catch (err) {
    t.fail(err)
  }

  try {
    new Client(new URL('https://localhost')) // eslint-disable-line
    t.pass('Should not throw')
  } catch (err) {
    t.fail(err)
  }
})

test('CONNECT throws in next tick', (t) => {
  t.plan(3)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body
        .on('end', () => {
          let ticked = false
          client.request({
            path: '/',
            method: 'CONNECT'
          }, (err) => {
            t.ok(err)
            t.strictSame(ticked, true)
          })
          ticked = true
        })
        .resume()
    })
  })
})

test('invalid signal', (t) => {
  t.plan(8)

  const client = new Client('http://localhost:3333')
  t.teardown(client.destroy.bind(client))

  let ticked = false
  client.request({ path: '/', method: 'GET', signal: {}, opaque: 'asd' }, (err, { opaque }) => {
    t.equal(ticked, true)
    t.equal(opaque, 'asd')
    t.type(err, errors.InvalidArgumentError)
  })
  client.pipeline({ path: '/', method: 'GET', signal: {} }, () => {})
    .on('error', (err) => {
      t.equal(ticked, true)
      t.type(err, errors.InvalidArgumentError)
    })
  client.stream({ path: '/', method: 'GET', signal: {}, opaque: 'asd' }, () => {}, (err, { opaque }) => {
    t.equal(ticked, true)
    t.equal(opaque, 'asd')
    t.type(err, errors.InvalidArgumentError)
  })
  ticked = true
})

test('invalid body chunk does not crash', (t) => {
  t.plan(1)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

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
      t.equal(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })
})

test('socket errors', t => {
  t.plan(2)
  const client = new Client('http://localhost:5554')
  t.teardown(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    t.ok(err)
    // TODO: Why UND_ERR_SOCKET?
    t.ok(err.code === 'ECONNREFUSED' || err.code === 'UND_ERR_SOCKET', err.code)
    t.end()
  })
})

test('headers overflow', t => {
  t.plan(2)
  const server = createServer()
  server.on('request', (req, res) => {
    res.writeHead(200, {
      'x-test-1': '1',
      'x-test-2': '2'
    })
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      maxHeaderSize: 10
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ok(err)
      t.equal(err.code, 'UND_ERR_HEADERS_OVERFLOW')
      t.end()
    })
  })
})

test('SocketError should expose socket details (net)', (t) => {
  t.plan(8)

  const server = createServer()

  server.once('request', (req, res) => {
    res.destroy()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ok(err instanceof errors.SocketError)
      if (err.socket.remoteFamily === 'IPv4') {
        t.equal(err.socket.remoteFamily, 'IPv4')
        t.equal(err.socket.localAddress, '127.0.0.1')
        t.equal(err.socket.remoteAddress, '127.0.0.1')
      } else {
        t.equal(err.socket.remoteFamily, 'IPv6')
        t.equal(err.socket.localAddress, '::1')
        t.equal(err.socket.remoteAddress, '::1')
      }
      t.type(err.socket.localPort, 'number')
      t.type(err.socket.remotePort, 'number')
      t.type(err.socket.bytesWritten, 'number')
      t.type(err.socket.bytesRead, 'number')
    })
  })
})

test('SocketError should expose socket details (tls)', (t) => {
  t.plan(8)

  const server = https.createServer(pem)

  server.once('request', (req, res) => {
    res.destroy()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ok(err instanceof errors.SocketError)
      if (err.socket.remoteFamily === 'IPv4') {
        t.equal(err.socket.remoteFamily, 'IPv4')
        t.equal(err.socket.localAddress, '127.0.0.1')
        t.equal(err.socket.remoteAddress, '127.0.0.1')
      } else {
        t.equal(err.socket.remoteFamily, 'IPv6')
        t.equal(err.socket.localAddress, '::1')
        t.equal(err.socket.remoteAddress, '::1')
      }
      t.type(err.socket.localPort, 'number')
      t.type(err.socket.remotePort, 'number')
      t.type(err.socket.bytesWritten, 'number')
      t.type(err.socket.bytesRead, 'number')
    })
  })
})
