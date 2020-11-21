'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { readFileSync, createReadStream } = require('fs')
const { Readable } = require('stream')
const { kSocket } = require('../lib/core/symbols')
const EE = require('events')

test('basic get', (t) => {
  t.plan(23)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers.foo)
    t.strictEqual('bar', req.headers.bar)
    t.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    t.tearDown(client.close.bind(client))

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.error(err)
      const { statusCode, headers, body } = data
      t.strictEqual(statusCode, 200)
      t.strictEqual(signal.listenerCount('abort'), 1)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual(signal.listenerCount('abort'), 0)
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.strictEqual(signal.listenerCount('abort'), 1)

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, { statusCode, headers, body }) => {
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

test('basic head', (t) => {
  t.plan(14)

  const server = createServer((req, res) => {
    t.strictEqual('/123', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
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
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello from example.com', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('head with host header', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'HEAD', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
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
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')
    t.notSame(req.headers['content-length'], null)

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.strictEqual(data, expected)
      res.end('hello')
    })
  }
}

test('basic POST with string', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, data) => {
      t.error(err)
      t.strictEqual(data.statusCode, 200)
      const bufs = []
      data.body
        .on('data', (buf) => {
          bufs.push(buf)
        })
        .on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
    })
  })
})

test('basic POST with empty string', (t) => {
  t.plan(7)

  const server = createServer(postServer(t, ''))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: '' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
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

test('basic POST with string and content-length', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      body: expected
    }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
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

test('basic POST with Buffer', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
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

test('basic POST with stream', (t) => {
  t.plan(7)

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
      t.strictEqual(statusCode, 200)
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

test('basic POST with custom stream', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const body = new EE()
    body.pipe = () => {}
    client.request({
      path: '/',
      method: 'POST',
      headersTimeout: 0,
      body
    }, (err, data) => {
      t.error(err)
      t.strictEqual(data.statusCode, 200)
      const bufs = []
      data.body.on('data', (buf) => {
        bufs.push(buf)
      })
      data.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.strictDeepEqual(client.busy, true)

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

test('basic POST with transfer encoding: chunked', (t) => {
  t.plan(8)

  let body
  const server = createServer(function (req, res) {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')
    t.same(req.headers['content-length'], null)
    t.strictEqual(req.headers['transfer-encoding'], 'chunked')

    body.push(null)

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.strictEqual(data, 'asd')
      res.end('hello')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
      t.strictEqual(statusCode, 200)
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

test('basic POST with empty stream', (t) => {
  t.plan(4)

  const server = createServer(function (req, res) {
    t.same(req.headers['content-length'], 0)
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const body = new Readable({
      autoDestroy: false,
      read () {
      },
      destroy (err, callback) {
        callback(!this._readableState.endEmitted ? new Error('asd') : err)
      }
    }).on('end', () => {
      process.nextTick(() => {
        t.strictEqual(body.destroyed, true)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictEqual(statusCode, 200)
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.strictEqual('/' + i, Buffer.concat(bufs).toString('utf8'))
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    for (var i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        t.error(err)
        t.strictEqual(statusCode, 200)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictDeepEqual(headers['set-cookie'], ['a cookie', 'another cookie', 'more cookies'])
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

test('ignore request header mutations', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.strictEqual(req.headers.test, 'test')
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http'
    })
    t.tearDown(client.close.bind(client))

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
    t.strictEqual(req.url, path)
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http'
    })
    t.tearDown(client.close.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http'
    })
    t.tearDown(client.destroy.bind(client))

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 4
    })
    t.tearDown(client.destroy.bind(client))

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
              t.strictEqual(client.busy, true)
              this.push(null)
            })
          }
        }).on('resume', () => {
          t.strictEqual(client.size, 1)
        })
      }, (err, data) => {
        t.error(err)
        data.body
          .resume()
          .on('end', () => {
            t.pass()
          })
      })
      t.strictEqual(client.busy, true)
    })
  })
})

test('300 requests succeed', (t) => {
  t.plan(300 * 3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    for (let n = 0; n < 300; ++n) {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.on('data', (chunk) => {
          t.strictEqual(chunk.toString(), 'asd')
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
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.request(null, 'asd')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('request args validation promise', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('increase pipelining', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    req.resume()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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

    t.strictEqual(client.running, 0)
    client.on('connect', () => {
      t.strictEqual(client.running, 0)
      process.nextTick(() => {
        t.strictEqual(client.running, 1)
        client.pipelining = 3
        t.strictEqual(client.running, 2)
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
        t.strictEqual('asd', buf)
      })
    })
  })
})

test('non recoverable socket error fails pending request', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
    })
    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.strictEqual(err.message, 'kaboom')
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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
      t.strictEqual(err.message, 'asd')
    })
  })
})
