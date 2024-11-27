'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { readFileSync, createReadStream } = require('node:fs')
const { createServer } = require('node:http')
const { Readable, PassThrough } = require('node:stream')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { kSocket } = require('../lib/core/symbols')
const { wrapWithAsyncIterable } = require('./utils/async-iterators')
const EE = require('node:events')
const { kUrl, kSize, kConnect, kBusy, kConnected, kRunning } = require('../lib/core/symbols')

const hasIPv6 = (() => {
  const iFaces = require('node:os').networkInterfaces()
  const re = process.platform === 'win32' ? /Loopback Pseudo-Interface/ : /lo/
  return Object.keys(iFaces).some(
    (name) => re.test(name) && iFaces[name].some(({ family }) => family === 6)
  )
})()

test('basic get', async (t) => {
  t = tspl(t, { plan: 24 })

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
  after(() => server.close())

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    t.strictEqual(client[kUrl].origin, `http://localhost:${server.address().port}`)

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.ifError(err)
      const { statusCode, headers, body } = data
      t.strictEqual(statusCode, 200)
      t.strictEqual(signal.listenerCount('abort'), 1)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('close', () => {
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
      t.ifError(err)
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

  await t.completed
})

test('basic get with custom request.reset=true', async (t) => {
  t = tspl(t, { plan: 26 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(req.headers.connection, 'close')
    t.strictEqual(undefined, req.headers.foo)
    t.strictEqual('bar', req.headers.bar)
    t.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {})
    after(() => client.close())

    t.strictEqual(client[kUrl].origin, `http://localhost:${server.address().port}`)

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      reset: true,
      headers: reqHeaders
    }, (err, data) => {
      t.ifError(err)
      const { statusCode, headers, body } = data
      t.strictEqual(statusCode, 200)
      t.strictEqual(signal.listenerCount('abort'), 1)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('close', () => {
        t.strictEqual(signal.listenerCount('abort'), 0)
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.strictEqual(signal.listenerCount('abort'), 1)

    client.request({
      path: '/',
      reset: true,
      method: 'GET',
      headers: reqHeaders
    }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic get with query params', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    const searchParamsObject = buildParams(req.url)
    t.deepStrictEqual(searchParamsObject, {
      bool: 'true',
      foo: '1',
      bar: 'bar',
      '%60~%3A%24%2C%2B%5B%5D%40%5E*()-': '%60~%3A%24%2C%2B%5B%5D%40%5E*()-',
      multi: ['1', '2'],
      nullVal: '',
      undefinedVal: ''
    })

    res.statusCode = 200
    res.end('hello')
  })
  after(() => server.close())

  const query = {
    bool: true,
    foo: 1,
    bar: 'bar',
    nullVal: null,
    undefinedVal: undefined,
    '`~:$,+[]@^*()-': '`~:$,+[]@^*()-',
    multi: [1, 2]
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      query
    }, (err, data) => {
      t.ifError(err)
      const { statusCode } = data
      t.strictEqual(statusCode, 200)
    })
    t.strictEqual(signal.listenerCount('abort'), 1)
  })

  await t.completed
})

test('basic get with query params fails if url includes hashmark', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    t.fail()
  })
  after(() => server.close())

  const query = {
    foo: 1,
    bar: 'bar',
    multi: [1, 2]
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    const signal = new EE()
    client.request({
      signal,
      path: '/#',
      method: 'GET',
      query
    }, (err, data) => {
      t.strictEqual(err.message, 'Query params cannot be passed when url already contains "?" or "#".')
    })
  })

  await t.completed
})

test('basic get with empty query params', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    const searchParamsObject = buildParams(req.url)
    t.deepStrictEqual(searchParamsObject, {})

    res.statusCode = 200
    res.end('hello')
  })
  after(() => server.close())

  const query = {}

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      query
    }, (err, data) => {
      t.ifError(err)
      const { statusCode } = data
      t.strictEqual(statusCode, 200)
    })
    t.strictEqual(signal.listenerCount('abort'), 1)
  })

  await t.completed
})

test('basic get with query params partially in path', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    t.fail()
  })
  after(() => server.close())

  const query = {
    foo: 1
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    const signal = new EE()
    client.request({
      signal,
      path: '/?bar=2',
      method: 'GET',
      query
    }, (err, data) => {
      t.strictEqual(err.message, 'Query params cannot be passed when url already contains "?" or "#".')
    })
  })

  await t.completed
})

test('using throwOnError should throw (request)', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.statusCode = 400
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    const signal = new EE()
    client.request({
      signal,
      path: '/',
      method: 'GET',
      throwOnError: true
    }, (err) => {
      t.strictEqual(err.message, 'invalid throwOnError')
      t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
    })
  })

  await t.completed
})

test('using throwOnError should throw (stream)', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.statusCode = 400
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    after(() => client.close())

    client.stream({
      path: '/',
      method: 'GET',
      throwOnError: true,
      opaque: new PassThrough()
    }, ({ opaque: pt }) => {
      pt.on('data', () => {
        t.fail()
      })
      return pt
    }, err => {
      t.strictEqual(err.message, 'invalid throwOnError')
      t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
    })
  })

  await t.completed
})

test('basic head', async (t) => {
  t = tspl(t, { plan: 14 })

  const server = createServer((req, res) => {
    t.strictEqual('/123', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})

test('basic head (IPv6)', { skip: !hasIPv6 }, async (t) => {
  t = tspl(t, { plan: 15 })

  const server = createServer((req, res) => {
    t.strictEqual('/123', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual(`[::1]:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, '::', () => {
    const client = new Client(`http://[::1]:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })

    client.request({ path: '/123', method: 'HEAD' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})

test('get with host header', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'GET', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('get with host header (IPv6)', { skip: !hasIPv6 }, async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('[::1]', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  after(() => server.close())

  server.listen(0, '::', () => {
    const client = new Client(`http://[::1]:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'GET', headers: { host: '[::1]' } }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello from [::1]', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await t.completed
})

test('head with host header', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('HEAD', req.method)
    t.strictEqual('example.com', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello from ' + req.headers.host)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'HEAD', headers: { host: 'example.com' } }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      body
        .resume()
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})

function postServer (t, expected) {
  return function (req, res) {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')
    t.notStrictEqual(req.headers['content-length'], null)

    req.setEncoding('utf8')
    let data = ''

    req.on('data', function (d) { data += d })

    req.on('end', () => {
      t.strictEqual(data, expected)
      res.end('hello')
    })
  }
}

test('basic POST with string', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'POST', body: expected }, (err, data) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with empty string', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer(postServer(t, ''))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'POST', body: '' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with string and content-length', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      body: expected
    }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with Buffer', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename)

  const server = createServer(postServer(t, expected.toString()))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'POST', body: expected }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with stream', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      headersTimeout: 0,
      body: createReadStream(__filename)
    }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with paused stream', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
      t.ifError(err)
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

  await t.completed
})

test('basic POST with custom stream', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.end('hello')
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const body = new EE()
    body.pipe = () => {}
    client.request({
      path: '/',
      method: 'POST',
      headersTimeout: 0,
      body
    }, (err, data) => {
      t.ifError(err)
      t.strictEqual(data.statusCode, 200)
      const bufs = []
      data.body.on('data', (buf) => {
        bufs.push(buf)
      })
      data.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
    t.deepStrictEqual(client[kBusy], true)

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

  await t.completed
})

test('basic POST with iterator', async (t) => {
  t = tspl(t, { plan: 3 })

  const expected = 'hello'

  const server = createServer((req, res) => {
    req.resume().on('end', () => {
      res.end(expected)
    })
  })
  after(() => server.close())

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
    after(() => client.close())

    client.request({
      path: '/',
      method: 'POST',
      requestTimeout: 0,
      body: iterable
    }, (err, { statusCode, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with iterator with invalid data', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer(() => {})
  after(() => server.close())

  const iterable = {
    [Symbol.iterator]: function * () {
      yield 0
    }
  }

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'POST',
      requestTimeout: 0,
      body: iterable
    }, err => {
      t.ok(err instanceof TypeError)
    })
  })

  await t.completed
})

test('basic POST with async iterator', async (t) => {
  t = tspl(t, { plan: 7 })

  const expected = readFileSync(__filename, 'utf8')

  const server = createServer(postServer(t, expected))
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-length': Buffer.byteLength(expected)
      },
      headersTimeout: 0,
      body: wrapWithAsyncIterable(createReadStream(__filename))
    }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
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

  await t.completed
})

test('basic POST with transfer encoding: chunked', async (t) => {
  t = tspl(t, { plan: 8 })

  let body
  const server = createServer(function (req, res) {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.method, 'POST')
    t.strictEqual(req.headers['content-length'], undefined)
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
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
      t.ifError(err)
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

  await t.completed
})

test('basic POST with empty stream', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer(function (req, res) {
    t.deepStrictEqual(req.headers['content-length'], '0')
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
      t.ifError(err)
      body
        .on('data', () => {
          t.fail()
        })
        .on('end', () => {
          t.ok(true, 'pass')
        })
    })
  })

  await t.completed
})

test('10 times GET', async (t) => {
  const num = 10
  t = tspl(t, { plan: 3 * num })

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.ifError(err)
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

  await t.completed
})

test('10 times HEAD', async (t) => {
  const num = 10
  t = tspl(t, { plan: num * 3 })

  const server = createServer((req, res) => {
    res.end(req.url)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    for (let i = 0; i < num; i++) {
      makeRequest(i)
    }

    function makeRequest (i) {
      client.request({ path: '/' + i, method: 'HEAD' }, (err, { statusCode, headers, body }) => {
        t.ifError(err)
        t.strictEqual(statusCode, 200)
        body
          .resume()
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })
    }
  })

  await t.completed
})

test('Set-Cookie', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/plain')
    res.setHeader('Set-Cookie', ['a cookie', 'another cookie', 'more cookies'])
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      t.deepStrictEqual(headers['set-cookie'], ['a cookie', 'another cookie', 'more cookies'])
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await t.completed
})

test('ignore request header mutations', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    t.strictEqual(req.headers.test, 'test')
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const headers = { test: 'test' }
    client.request({
      path: '/',
      method: 'GET',
      headers
    }, (err, { body }) => {
      t.ifError(err)
      body.resume()
    })
    headers.test = 'asd'
  })

  await t.completed
})

test('url-like url', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ifError(err)
      data.body.resume()
    })
  })

  await t.completed
})

test('an absolute url as path', async (t) => {
  t = tspl(t, { plan: 2 })

  const path = 'http://example.com'

  const server = createServer((req, res) => {
    t.strictEqual(req.url, path)
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    after(() => client.close())

    client.request({ path, method: 'GET' }, (err, data) => {
      t.ifError(err)
      data.body.resume()
    })
  })

  await t.completed
})

test('multiple destroy callback', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client({
      hostname: 'localhost',
      port: server.address().port,
      protocol: 'http:'
    })
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.ifError(err)
      data.body
        .resume()
        .on('error', (err) => {
          t.ok(err instanceof Error)
        })
      client.destroy(new Error(), (err) => {
        t.ifError(err)
      })
      client.destroy(new Error(), (err) => {
        t.ifError(err)
      })
    })
  })

  await t.completed
})

test('only one streaming req at a time', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 4
    })
    after(() => client.destroy())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
      data.body.resume()

      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.ifError(err)
        data.body.resume()
      })

      client.request({
        path: '/',
        method: 'PUT',
        idempotent: true,
        body: new Readable({
          read () {
            setImmediate(() => {
              t.strictEqual(client[kBusy], true)
              this.push(null)
            })
          }
        }).on('resume', () => {
          t.strictEqual(client[kSize], 1)
        })
      }, (err, data) => {
        t.ifError(err)
        data.body
          .resume()
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })
      t.strictEqual(client[kBusy], true)
    })
  })

  await t.completed
})

test('only one async iterating req at a time', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 4
    })
    after(() => client.destroy())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.ifError(err)
      data.body.resume()

      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.ifError(err)
        data.body.resume()
      })
      const body = wrapWithAsyncIterable(new Readable({
        read () {
          setImmediate(() => {
            t.strictEqual(client[kBusy], true)
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
        t.ifError(err)
        data.body
          .resume()
          .on('end', () => {
            t.ok(true, 'pass')
          })
      })
      t.strictEqual(client[kBusy], true)
    })
  })

  await t.completed
})

test('300 requests succeed', async (t) => {
  t = tspl(t, { plan: 300 * 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    for (let n = 0; n < 300; ++n) {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.ifError(err)
        data.body.on('data', (chunk) => {
          t.strictEqual(chunk.toString(), 'asd')
        }).on('end', () => {
          t.ok(true, 'pass')
        })
      })
    }
  })

  await t.completed
})

test('request args validation', async (t) => {
  t = tspl(t, { plan: 2 })

  const client = new Client('http://localhost:5000')

  client.request(null, (err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.request(null, 'asd')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }

  await t.completed
})

test('request args validation promise', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:5000')

  client.request(null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  await t.completed
})

test('increase pipelining', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    req.resume()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      path: '/',
      method: 'GET',
      blocking: false
    }, () => {
      if (!client.destroyed) {
        t.fail()
      }
    })

    client.request({
      path: '/',
      method: 'GET',
      blocking: false
    }, () => {
      if (!client.destroyed) {
        t.fail()
      }
    })

    t.strictEqual(client[kRunning], 0)
    client.on('connect', () => {
      t.strictEqual(client[kRunning], 0)
      process.nextTick(() => {
        t.strictEqual(client[kRunning], 1)
        client.pipelining = 3
        t.strictEqual(client[kRunning], 2)
      })
    })
  })

  await t.completed
})

test('destroy in push', async (t) => {
  t = tspl(t, { plan: 4 })

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.ifError(err)
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
      t.ifError(err)
      let buf = ''
      body.on('data', (chunk) => {
        buf = chunk.toString()
        _res.end()
      }).on('end', () => {
        t.strictEqual('asd', buf)
      })
    })
  })

  await t.completed
})

test('non recoverable socket error fails pending request', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('POST empty with error', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('busy', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    after(() => client.close())

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err) => {
        t.ifError(err)
      })
      t.strictEqual(client[kBusy], true)
    })
  })

  await t.completed
})

test('connected', async (t) => {
  t = tspl(t, { plan: 7 })

  const server = createServer((req, res) => {
    // needed so that disconnect is emitted
    res.setHeader('connection', 'close')
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const url = new URL(`http://localhost:${server.address().port}`)
    const client = new Client(url, {
      pipelining: 1
    })
    after(() => client.close())

    client.on('connect', (origin, [self]) => {
      t.strictEqual(origin, url)
      t.strictEqual(client, self)
    })
    client.on('disconnect', (origin, [self]) => {
      t.strictEqual(origin, url)
      t.strictEqual(client, self)
    })

    t.strictEqual(client[kConnected], false)
    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err) => {
        t.ifError(err)
      })
      t.strictEqual(client[kConnected], true)
    })
  })

  await t.completed
})

test('emit disconnect after destroy', async t => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const url = new URL(`http://localhost:${server.address().port}`)
    const client = new Client(url)

    t.strictEqual(client[kConnected], false)
    client[kConnect](() => {
      t.strictEqual(client[kConnected], true)
      let disconnected = false
      client.on('disconnect', () => {
        disconnected = true
        t.ok(true, 'pass')
      })
      client.destroy(() => {
        t.strictEqual(disconnected, true)
      })
    })
  })

  await t.completed
})

test('end response before request', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

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
        t.ok(true, 'pass')
      })
      .resume()
    client.on('disconnect', (url, targets, err) => {
      t.strictEqual(err.code, 'UND_ERR_INFO')
    })
  })

  await t.completed
})

test('parser pause with no body timeout', async (t) => {
  t = tspl(t, { plan: 2 })
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
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      body.resume()
    })
  })

  await t.completed
})

test('TypedArray and DataView body', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    t.strictEqual(req.headers['content-length'], '8')
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())

    const body = Uint8Array.from(Buffer.alloc(8))
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      body.resume()
    })
  })

  await t.completed
})

test('async iterator empty chunk continues', async (t) => {
  t = tspl(t, { plan: 5 })
  const serverChunks = ['hello', 'world']
  const server = createServer((req, res) => {
    let str = ''
    let i = 0
    req.on('data', (chunk) => {
      const content = chunk.toString()
      t.strictEqual(serverChunks[i++], content)
      str += content
    }).on('end', () => {
      t.strictEqual(str, serverChunks.join(''))
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())

    const body = (async function * () {
      yield serverChunks[0]
      yield ''
      yield serverChunks[1]
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      body.resume()
    })
  })

  await t.completed
})

test('async iterator error from server destroys early', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    req.on('data', (chunk) => {
      res.destroy()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())
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
        t.ok(true, 'pass')
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ok(err)
      t.strictEqual(statusCode, undefined)
      gotDestroyed()
    })
  })

  await t.completed
})

test('regular iterator error from server closes early', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    req.on('data', () => {
      process.nextTick(() => {
        res.destroy()
      })
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())
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
        t.ok(true, 'pass')
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ok(err)
      t.strictEqual(statusCode, undefined)
      gotDestroyed = true
    })
  })
  await t.completed
})

test('async iterator early return closes early', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    req.on('data', () => {
      res.writeHead(200)
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())
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
        t.ok(true, 'pass')
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err, { statusCode, body }) => {
      t.ifError(err)
      t.strictEqual(statusCode, 200)
      gotDestroyed()
    })
  })
  await t.completed
})

test('async iterator yield unsupported TypedArray', {
  skip: !!require('stream')._isArrayBufferView
}, async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    req.on('end', () => {
      res.writeHead(200)
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())
    const body = (async function * () {
      try {
        yield new Int32Array([1])
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true, 'pass')
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err) => {
      t.ok(err)
      t.strictEqual(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })

  await t.completed
})

test('async iterator yield object error', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = createServer((req, res) => {
    req.on('end', () => {
      res.writeHead(200)
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0
    })
    after(() => client.close())
    const body = (async function * () {
      try {
        yield {}
        t.fail('should not get here, iterator should be destroyed')
      } finally {
        t.ok(true, 'pass')
      }
    })()
    client.request({ path: '/', method: 'POST', body }, (err) => {
      t.ok(err)
      t.strictEqual(err.code, 'ERR_INVALID_ARG_TYPE')
    })
  })

  await t.completed
})

test('Successfully get a Response when neither a Transfer-Encoding or Content-Length header is present', async (t) => {
  t = tspl(t, { plan: 4 })
  const server = createServer((req, res) => {
    req.on('data', (data) => {
    })
    req.on('end', () => {
      res.removeHeader('transfer-encoding')
      res.writeHead(200, {
        // Header isn't actually necessary, but tells node to close after response
        connection: 'close',
        foo: 'bar'
      })
      res.flushHeaders()
      res.end('a response body')
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({ path: '/', method: 'GET' }, (err, { body, headers }) => {
      t.ifError(err)
      t.equal(headers['content-length'], undefined)
      t.equal(headers['transfer-encoding'], undefined)
      const bufs = []
      body.on('error', () => {
        t.fail('Closing the connection is valid')
      })
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.equal('a response body', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })

  await t.completed
})

function buildParams (path) {
  const cleanPath = path.replace('/?', '').replace('/', '').split('&')
  const builtParams = cleanPath.reduce((acc, entry) => {
    const [key, value] = entry.split('=')
    if (key.length === 0) {
      return acc
    }

    if (acc[key]) {
      if (Array.isArray(acc[key])) {
        acc[key].push(value)
      } else {
        acc[key] = [acc[key], value]
      }
    } else {
      acc[key] = value
    }
    return acc
  }, {})

  return builtParams
}

test('\\r\\n in Headers', async (t) => {
  t = tspl(t, { plan: 1 })

  const reqHeaders = {
    bar: '\r\nbar'
  }

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET',
    headers: reqHeaders
  }, (err) => {
    t.strictEqual(err.message, 'invalid bar header')
  })
})

test('\\r in Headers', async (t) => {
  t = tspl(t, { plan: 1 })

  const reqHeaders = {
    bar: '\rbar'
  }

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET',
    headers: reqHeaders
  }, (err) => {
    t.strictEqual(err.message, 'invalid bar header')
  })
})

test('\\n in Headers', async (t) => {
  t = tspl(t, { plan: 1 })

  const reqHeaders = {
    bar: '\nbar'
  }

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET',
    headers: reqHeaders
  }, (err) => {
    t.strictEqual(err.message, 'invalid bar header')
  })
})

test('\\n in Headers', async (t) => {
  t = tspl(t, { plan: 1 })

  const reqHeaders = {
    '\nbar': 'foo'
  }

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET',
    headers: reqHeaders
  }, (err) => {
    t.strictEqual(err.message, 'invalid header key')
  })
})

test('\\n in Path', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/\n',
    method: 'GET'
  }, (err) => {
    t.strictEqual(err.message, 'invalid request path')
  })
})

test('\\n in Method', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:4242', {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET\n'
  }, (err) => {
    t.strictEqual(err.message, 'invalid request method')
  })
})
