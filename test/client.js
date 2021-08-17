'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { readFileSync, createReadStream } = require('fs')
const { Readable } = require('stream')
const { kSocket } = require('../lib/core/symbols')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')
const EE = require('events')
const { kUrl, kSize, kConnect, kBusy, kConnected, kRunning } = require('../lib/core/symbols')

test('basic get', (t) => {
  t.plan(24)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    t.equal(undefined, req.headers.foo)
    t.equal('bar', req.headers.bar)
    t.equal(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    t.teardown(client.close.bind(client))

    t.equal(client[kUrl].origin, `http://localhost:${server.address().port}`)

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.error(err)
      const { statusCode, headers, body } = data
      t.equal(statusCode, 200)
      t.equal(signal.listenerCount('abort'), 1)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal(signal.listenerCount('abort'), 0)
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.equal(signal.listenerCount('abort'), 1)

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, { statusCode, headers, body }) => {
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

test('basic head', (t) => {
  t.plan(14)

  const server = createServer((req, res) => {
    t.equal('/123', req.url)
    t.equal('HEAD', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('basic head (IPv6)', (t) => {
  t.plan(14)

  const server = createServer((req, res) => {
    t.equal('/123', req.url)
    t.equal('HEAD', req.method)
    t.equal(`[::1]:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, '::', () => {
    const client = new Client(`http://[::1]:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('get with host header', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello from example.com', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('get with host header (IPv6)', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal('[::1]', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, '::', () => {
    const client = new Client(`http://[::1]:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', headers: { host: '[::1]' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('hello from [::1]', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('head with host header', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('HEAD', req.method)
    t.equal('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'HEAD', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })
  })
})

function postServer (t, expected) {
  return function (req, res) {
    t.equal(req.url, '/')
    t.equal(req.method, 'POST')
    t.notSame(req.headers['content-length'], null)

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.equal(data, expected)
      res.end('hello')
    })
  }
}

test('basic POST with string', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, data) => {
      t.error(err)
      t.equal(data.statusCode, 200)
      const bufs = []
      data.body
        .on('data', (buf) => {
          bufs.push(buf)
        })
        .on('end', () => {
          t.equal('hello', Buffer.concat(bufs).toString('utf8'))
        })
    })
  })
})

test('basic POST with empty string', (t) => {
  t.plan(7)

  const server = createServer(postServer(t, ''))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: '' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with string and content-length', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      body: expected
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with Buffer', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with stream', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      headersTimeout: 0,
      body: createReadStream(__filename)
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with paused stream', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const stream = createReadStream(__filename)
    stream.pause()
    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      headersTimeout: 0,
      body: stream
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with custom stream', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.end('hello')
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const body = new EE()
    body.pipe = () => {}
    client.request({
      path: '/',
      method: 'POST',
      headersTimeout: 0,
      body
    }, (err, data) => {
      t.error(err)
      t.equal(data.statusCode, 200)
      const bufs = []
      data.body.on('data', (buf) => {
        bufs.push(buf)
      })
      data.body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.strictSame(client[kBusy], true)

    body.on('close', () => {
      body.emit('end')
    })

    client.on('connect', () => {
      setImmediate(() => {
        body.emit('data', '')
        while (!client[kSocket]._writableState.needDrain) {
          body.emit('data', Buffer.alloc(4096))
        }
        client[kSocket].on('drain', () => {
          body.emit('data', Buffer.alloc(4096))
          body.emit('close')
        })
      })
    })
  })
})

test('basic POST with iterator', (t) => {
  t.plan(3)

  const expected = 'hello'

  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.end(expected)
    })
  })
  t.teardown(server.close.bind(server))

  const iterable = {
    [Symbol.iterator]: function * () {
      for (let i = 0; i < expected.length - 1; i++) {
        yield expected[i]
      }
      return expected[expected.length - 1]
    }
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      requestTimeout: 0,
      body: iterable
    }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with iterator with invalid data', (t) => {
  t.plan(1)

  const server = createServer(() => {})
  t.teardown(server.close.bind(server))

  const iterable = {
    [Symbol.iterator]: function * () {
      yield 0
    }
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      requestTimeout: 0,
      body: iterable
    }, err => {
      t.ok(err instanceof TypeError)
    })
  })
})

test('basic POST with async iterator', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      headersTimeout: 0,
      body: wrapWithAsyncIterable(createReadStream(__filename))
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with transfer encoding: chunked', (t) => {
  t.plan(8)

  let body
  const server = createServer(function (req, res) {
    t.equal(req.url, '/')
    t.equal(req.method, 'POST')
    t.same(req.headers['content-length'], null)
    t.equal(req.headers['transfer-encoding'], 'chunked')

    body.push(null)

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.equal(data, 'asd')
      res.end('hello')
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    body = new Readable({
      read () { }
    })
    body.push('asd')
    client.request({
      path: '/',
      method: 'POST',
      // no content-length header
      body
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
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

test('basic POST with empty stream', (t) => {
  t.plan(4)

  const server = createServer(function (req, res) {
    t.same(req.headers['content-length'], 0)
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const body = new Readable({
      autoDestroy: false,
      read () {
      },
      destroy (err, callback) {
        callback(!this._readableState.endEmitted ? new Error('asd') : err)
      }
    }).on('end', () => {
      process.nextTick(() => {
        t.equal(body.destroyed, true)
      })
    })
    body.push(null)
    client.request({
      path: '/',
      method: 'POST',
      body
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body
        .on('data', () => {
          t.fail()
        })
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('10 times GET', (t) => {
  const num = 10
  t.plan(3 * 10)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.equal('/' + i, Buffer.concat(bufs).toString('utf8'))
        })
      })
    }
  })
})

test('10 times HEAD', (t) => {
  const num = 10
  t.plan(3 * 10)

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.equal(statusCode, 200)
        body
          .resume()
          .on('end', () => {
            t.pass()
          })
      })
    }
  })
})

test('Set-Cookie', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.setHeader('Set-Cookie', ['a cookie', 'another cookie', 'more cookies'])
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      t.strictSame(headers['set-cookie'], ['a cookie', 'another cookie', 'more cookies'])
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

test('ignore request header mutations', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.equal(req.headers.test, 'test')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const headers = { test: 'test' }
    client.request({
      path: '/',
      method: 'GET',
      headers
    }, (err, { body }) => {
      t.error(err)
      body.resume()
    })
    headers.test = 'asd'
  })
})

test('url-like url', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})

test('an absolute url as path', (t) => {
  t.plan(2)

  const path = 'http://example.com'

  const server = createServer((req, res) => {
    t.equal(req.url, path)
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    t.teardown(client.close.bind(client))

    client.request({ path, method: 'GET' }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})

test('multiple destroy callback', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    t.teardown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .on('error', () => {
          t.pass()
        })
      client.destroy(new Error(), (err) => {
        t.error(err)
      })
      client.destroy(new Error(), (err) => {
        t.error(err)
      })
    })
  })
})

test('only one streaming req at a time', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 4
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()

      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.resume()
      })

      client.request({
        path: '/',
        method: 'PUT',
        idempotent: true,
        body: new Readable({
          read () {
            setImmediate(() => {
              t.equal(client[kBusy], true)
              this.push(null)
            })
          }
        }).on('resume', () => {
          t.equal(client[kSize], 1)
        })
      }, (err, data) => {
        t.error(err)
        data.body
          .resume()
          .on('end', () => {
            t.pass()
          })
      })
      t.equal(client[kBusy], true)
    })
  })
})

test('only one async iterating req at a time', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 4
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume()

      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.resume()
      })
      const body = wrapWithAsyncIterable(new Readable({
        read () {
          setImmediate(() => {
            t.equal(client[kBusy], true)
            this.push(null)
          })
        }
      }))
      client.request({
        path: '/',
        method: 'PUT',
        idempotent: true,
        body
      }, (err, data) => {
        t.error(err)
        data.body
          .resume()
          .on('end', () => {
            t.pass()
          })
      })
      t.equal(client[kBusy], true)
    })
  })
})

test('300 requests succeed', (t) => {
  t.plan(300 * 3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    for (let n = 0; n < 300; ++n) {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.on('data', (chunk) => {
          t.equal(chunk.toString(), 'asd')
        }).on('end', () => {
          t.pass()
        })
      })
    }
  })
})

test('request args validation', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')

  client.request(null, (err) => {
    t.type(err, errors.InvalidArgumentError)
  })

  try {
    client.request(null, 'asd')
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
  }
})

test('request args validation promise', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.type(err, errors.InvalidArgumentError)
  })
})

test('increase pipelining', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    req.resume()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, () => {
      if (!client.destroyed) {
        t.fail()
      }
    })

    client.request({
      path: '/',
      method: 'GET'
    }, () => {
      if (!client.destroyed) {
        t.fail()
      }
    })

    t.equal(client[kRunning], 0)
    client.on('connect', () => {
      t.equal(client[kRunning], 0)
      process.nextTick(() => {
        t.equal(client[kRunning], 1)
        client.pipelining = 3
        t.equal(client[kRunning], 2)
      })
    })
  })
})

test('destroy in push', (t) => {
  t.plan(4)

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.error(err)
      body.once('data', () => {
        _res.write('asd')
        body.on('data', (buf) => {
          body.destroy()
          _res.end()
        }).on('error', (err) => {
          t.ok(err)
        })
      })
    })

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.error(err)
      let buf = ''
      body.on('data', (chunk) => {
        buf = chunk.toString()
        _res.end()
      }).on('end', () => {
        t.equal('asd', buf)
      })
    })
  })
})

test('non recoverable socket error fails pending request', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.equal(err.message, 'kaboom')
    })
    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.equal(err.message, 'kaboom')
    })
    client.on('connect', () => {
      client[kSocket].destroy(new Error('kaboom'))
    })
  })
})

test('POST empty with error', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const body = new Readable({
      read () {
      }
    })
    body.push(null)
    client.on('connect', () => {
      process.nextTick(() => {
        body.emit('error', new Error('asd'))
      })
    })

    client.request({ path: '/', method: 'POST', body }, (err, data) => {
      t.equal(err.message, 'asd')
    })
  })
})

test('busy', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.teardown(client.close.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err) => {
        t.error(err)
      })
      t.equal(client[kBusy], true)
    })
  })
})

test('connected', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    // needed so that disconnect is emitted
    res.setHeader('connection', 'close')
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const url = new URL(`http://localhost:${server.address().port}`)
    const client = new Client(url, {
      pipelining: 1
    })
    t.teardown(client.close.bind(client))

    client.on('connect', (origin, [self]) => {
      t.equal(origin, url)
      t.equal(client, self)
    })
    client.on('disconnect', (origin, [self]) => {
      t.equal(origin, url)
      t.equal(client, self)
    })

    t.equal(client[kConnected], false)
    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err) => {
        t.error(err)
      })
      t.equal(client[kConnected], true)
    })
  })
})

test('emit disconnect after destroy', t => {
  t.plan(4)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const url = new URL(`http://localhost:${server.address().port}`)
    const client = new Client(url)

    t.equal(client[kConnected], false)
    client[kConnect](() => {
      t.equal(client[kConnected], true)
      let disconnected = false
      client.on('disconnect', () => {
        disconnected = true
        t.pass()
      })
      client.destroy(() => {
        t.equal(disconnected, true)
      })
    })
  })
})

test('end response before request', t => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    const readable = new Readable({
      read () {
        this.push('asd')
      }
    })
    const { body } = await client.request({
      method: 'GET',
      path: '/',
      body: readable
    })
    body
      .on('error', () => {
        t.fail()
      })
      .on('end', () => {
        t.pass()
      })
      .resume()
    client.on('disconnect', (url, targets, err) => {
      t.equal(err.code, 'UND_ERR_INFO')
    })
  })
})

test('parser pause with no body timeout', (t) => {
  t.plan(2)
  const server = createServer((req, res) => {
    let counter = 0
    const t = setInterval(() => {
      counter++
      const payload = Buffer.alloc(counter * 4096).fill(0)
      if (counter === 3) {
        clearInterval(t)
        res.end(payload)
      } else {
        res.write(payload)
      }
    }, 20)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      body.resume()
    })
  })
})

test('TypedArray and DataView body', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    t.equal(req.headers['content-length'], '8')
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))

    const body = Uint8Array.from(Buffer.alloc(8))
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      body.resume()
    })
  })
})

test('async iterator empty chunk continues', (t) => {
  t.plan(5)
  const serverChunks = ['hello', 'world']
  const server = createServer((req, res) => {
    let str = ''
    let i = 0
    req.on('data', (chunk) => {
      const content = chunk.toString()
      t.equal(serverChunks[i++], content)
      str += content
    }).on('end', () => {
      t.equal(str, serverChunks.join(''))
      res.end()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))

    const body = (async function * () {
      yield serverChunks[0]
      yield ''
      yield serverChunks[1]
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      body.resume()
    })
  })
})

test('async iterator error from server destroys early', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    req.on('data', (chunk) => {
      res.destroy()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))
    let gotDestroyed
    const body = (async function * () {
      try {
        const promise = new Promise(resolve => {
          gotDestroyed = resolve
        })
        yield 'hello'
        await promise
        yield 'inner-value'
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true)
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ok(err)
      t.equal(statusCode, undefined)
      gotDestroyed()
    })
  })
})

test('regular iterator error from server closes early', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    req.on('data', () => {
      process.nextTick(() => {
        res.destroy()
      })
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))
    let gotDestroyed = false
    const body = (function * () {
      try {
        yield 'start'
        while (!gotDestroyed) {
          yield 'zzz'
          // for eslint
          gotDestroyed = gotDestroyed || false
        }
        yield 'zzz'
        t.fail('should not get here, iterator should be destroyed')
        yield 'zzz'
      } finally {
        t.ok(true)
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ok(err)
      t.equal(statusCode, undefined)
      gotDestroyed = true
    })
  })
})

test('async iterator early return closes early', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    req.on('data', () => {
      res.writeHead(200)
      res.end()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))
    let gotDestroyed
    const body = (async function * () {
      try {
        const promise = new Promise(resolve => {
          gotDestroyed = resolve
        })
        yield 'hello'
        await promise
        yield 'inner-value'
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true)
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.error(err)
      t.equal(statusCode, 200)
      gotDestroyed()
    })
  })
})

test('async iterator yield unsupported TypedArray', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    req.on('end', () => {
      res.writeHead(200)
      res.end()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))
    const body = (async function * () {
      try {
        yield new Int32Array([1])
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true)
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err) => {
      t.ok(err)
      t.equal(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })
})

test('async iterator yield object error', (t) => {
  t.plan(3)
  const server = createServer((req, res) => {
    req.on('end', () => {
      res.writeHead(200)
      res.end()
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    t.teardown(client.close.bind(client))
    const body = (async function * () {
      try {
        yield {}
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true)
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err) => {
      t.ok(err)
      t.equal(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })
})
