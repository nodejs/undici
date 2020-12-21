'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const net = require('net')
const { Readable } = require('stream')

const { kSocket } = require('../lib/core/symbols')

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
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
      t.ok(err instanceof Error) // we are expecting an error
      t.strictEqual(data.opaque, 'asd')
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
    t.tearDown(client.destroy.bind(client))

    // all of these will error
    for (let i = 0; i < 3; i++) {
      client.request({ path: '/', method: 'GET', idempotent: false, opaque: 'asd' }, (err, data) => {
        t.ok(err instanceof Error) // we are expecting an error
        t.strictEqual(data.opaque, 'asd')
      })
    }

    // this will be queued up
    client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
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
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        // higher than the length of the string
        'content-length': 42
      },
      opaque: 'asd',
      body: new Readable({
        read () {
          this.push('a string')
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
      t.strictEqual(data.opaque, 'asd')
    })

    // this will be queued up
    client.request({ path: '/', method: 'GET', idempotent: false }, (err, { statusCode, headers, body }) => {
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
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      opaque: 'asd',
      body: new Readable({
        read () {
          this.push('a string')
          this.destroy(new Error('kaboom'))
        }
      })
    }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
      t.strictEqual(data.opaque, 'asd')
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

test('invalid options throws', (t) => {
  try {
    new Client({ port: 'foobar' }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid port')
  }

  try {
    new Client(new URL('http://asd:200/somepath')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200?q=asd')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://asd:200#asd')) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid url')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      socketPath: 1
    })
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid socketPath')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeout: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid keepAliveTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveMaxTimeout: 0
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid keepAliveMaxTimeout')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      keepAliveTimeoutThreshold: 'asd'
    }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid keepAliveTimeoutThreshold')
  }

  try {
    new Client({ // eslint-disable-line
      protocol: 'asd'
    })
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid protocol')
  }

  try {
    new Client({ // eslint-disable-line
      hostname: 1
    })
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid hostname')
  }

  try {
    new Client(new URL('http://localhost:200'), { // eslint-disable-line
      maxHeaderSize: 'asd'
    })
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid maxHeaderSize')
  }

  try {
    new Client(1) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid url')
  }

  try {
    const client = new Client(new URL('http://localhost:200')) // eslint-disable-line
    client.destroy(null, null)
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid callback')
  }

  try {
    const client = new Client(new URL('http://localhost:200')) // eslint-disable-line
    client.close(null, null)
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid callback')
  }

  try {
    new Client(new URL('http://localhost:200'), { maxKeepAliveTimeout: 1e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'unsupported maxKeepAliveTimeout, use keepAliveMaxTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { keepAlive: false }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'unsupported keepAlive, use pipelining=0 instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { idleTimeout: 30e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'unsupported idleTimeout, use keepAliveTimeout instead')
  }

  try {
    new Client(new URL('http://localhost:200'), { socketTimeout: 30e3 }) // eslint-disable-line
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'unsupported socketTimeout, use headersTimeout & bodyTimeout instead')
  }

  t.end()
})

test('POST which fails should error response', (t) => {
  t.plan(4)

  const server = createServer()
  server.on('request', (req, res) => {
    req.once('data', () => {
      res.destroy()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const body = new Readable({ read () {} })
    body.push('asd')
    body.on('error', (err) => {
      t.strictEqual(err, _err)
    })

    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, data) => {
      t.strictEqual(err, _err)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: /asdasd/
    }, (err, data) => {
      t.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: 0
    }, (err, data) => {
      t.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: false
    }, (err, data) => {
      t.ok(err instanceof errors.InvalidArgumentError)
    })

    client.request({
      path: '/',
      method: 'POST',
      body: ''
    }, (err, data) => {
      t.error(err instanceof errors.InvalidArgumentError)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: new Uint8Array()
    }, (err, data) => {
      t.error(err instanceof errors.InvalidArgumentError)
      data.body.resume()
    })

    client.request({
      path: '/',
      method: 'POST',
      body: Buffer.alloc(10)
    }, (err, data) => {
      t.error(err instanceof errors.InvalidArgumentError)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err) => {
      t.ok(err)
      client.close((err) => {
        t.error(err)
      })
    })
  })
})

test('socket fail while writing request body', (t) => {
  t.plan(2)

  const server = createServer()
  server.once('request', (req, res) => {
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const body = new Readable({ read () {} })
    body.push('asd')

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

test('socket fail while ending request body', (t) => {
  t.plan(3)

  const server = createServer()
  server.once('request', (req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.tearDown(client.destroy.bind(client))

    const _err = new Error('kaboom')
    client.on('connect', () => {
      process.nextTick(() => {
        client[kSocket].destroy(_err)
      })
    })
    const body = new Readable({ read () {} })
    body.push(null)
    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err) => {
      t.strictEqual(err, _err)
    })
    client.close((err) => {
      t.error(err)
      client.close((err) => {
        t.ok(err instanceof errors.ClientDestroyedError)
      })
    })
  })
})

test('queued request should not fail on socket destroy', (t) => {
  t.plan(4)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

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
        t.strictEqual(requestErrored, true)
      })
    })
    client.request({
      path: '/',
      method: 'GET',
      opaque: 'asd'
    }, (err, data) => {
      requestErrored = true
      t.ok(err)
      t.strictEqual(data.opaque, 'asd')
    })
  })
})

test('retry idempotent inflight', (t) => {
  t.plan(3)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.close.bind(client))

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
    t.ok(err instanceof errors.InvalidArgumentError)
  })
  client.pipeline(null).on('error', (err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
            t.strictDeepEqual(ticked, true)
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
    t.strictEqual(ticked, true)
    t.strictEqual(opaque, 'asd')
    t.ok(err instanceof errors.InvalidArgumentError)
  })
  client.pipeline({ path: '/', method: 'GET', signal: {} }, () => {})
    .on('error', (err) => {
      t.strictEqual(ticked, true)
      t.ok(err instanceof errors.InvalidArgumentError)
    })
  client.stream({ path: '/', method: 'GET', signal: {}, opaque: 'asd' }, () => {}, (err, { opaque }) => {
    t.strictEqual(ticked, true)
    t.strictEqual(opaque, 'asd')
    t.ok(err instanceof errors.InvalidArgumentError)
  })
  ticked = true
})

test('invalid body chunk does not crash', (t) => {
  t.plan(1)

  const server = createServer()
  server.on('request', (req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
      t.strictEqual(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })
})

test('socket errors', t => {
  t.plan(2)
  const client = new Client('http://localhost:5554')
  t.tearDown(client.destroy.bind(client))

  client.request({ path: '/', method: 'GET' }, (err, data) => {
    t.ok(err)
    // TODO: Why UND_ERR_SOCKET?
    t.ok(err.code === 'ECONNREFUSED' || err.code === 'UND_ERR_SOCKET', err.code)
    t.end()
  })
})
