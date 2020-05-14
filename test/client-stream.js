'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { PassThrough } = require('stream')

test('stream get', (t) => {
  t.plan(7)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('localhost', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      const pt = new PassThrough()
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      pt.on('data', (buf) => {
        bufs.push(buf)
      })
      pt.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
      return pt
    }, (err) => {
      t.error(err)
    })
  })
})

test('stream get skip body', (t) => {
  t.plan(12)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('localhost', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      // Don't return writable. Skip the body.
    }, (err) => {
      t.error(err)
    })

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      // Don't return writable. Skip the body.
    }, (err) => {
      t.error(err)
    })
  })
})

test('stream GET destroy res', (t) => {
  t.plan(14)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual('localhost', req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      const pt = new PassThrough()
      pt.on('error', (err) => {
        t.ok(err)
      })
      setImmediate(() => {
        pt.destroy(new Error('kaboom'))
      })

      return pt
    }, (err) => {
      t.ok(err)
    })

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')

      let ret = ''
      const pt = new PassThrough()
      pt.on('data', chunk => {
        ret += chunk
      }).on('end', () => {
        t.strictEqual(ret, 'hello')
      })

      return pt
    }, (err) => {
      t.error(err)
    })
  })
})

test('stream GET remote destroy', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.write('asd')
    setImmediate(() => {
      res.destroy()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough()
      pt.on('error', (err) => {
        t.ok(err)
      })
      return pt
    }, (err) => {
      t.ok(err)
    })

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough()
      pt.on('error', (err) => {
        t.ok(err)
      })
      return pt
    }, (err) => {
      t.ok(err)
    })
  })
})

test('stream response resume back pressure and non standard error', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.write(Buffer.alloc(1e3))
    setImmediate(() => {
      res.write(Buffer.alloc(1e7))
      res.end()
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET',
      maxAbortedPayload: 1e5
    }, () => {
      const pt = new PassThrough()
      pt.on('data', () => {
        pt.emit('error', new Error('kaboom'))
      }).once('error', (err) => {
        t.ok(err)
      })
      return pt
    }, (err) => {
      t.ok(err)
    })

    client.on('reconnect', () => {
      t.pass()
    })

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough()
      pt.resume()
      return pt
    }, (err) => {
      t.error(err)
    })
  })
})
