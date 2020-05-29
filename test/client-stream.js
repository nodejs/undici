'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
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
      method: 'GET',
      opaque: new PassThrough()
    }, ({ statusCode, headers, opaque: pt }) => {
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
    }).then(() => {
      t.pass()
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
        .on('error', (err) => {
          t.ok(err)
        })
        .on('data', () => {
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
    }).catch((err) => {
      t.ok(err)
    })
  })
})

test('stream response resume back pressure and non standard error', (t) => {
  t.plan(5)

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

    client.on('disconnect', (err) => {
      t.ok(err)
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

test('stream waits only for writable side', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(1e3))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const pt = new PassThrough()
    client.stream({
      path: '/',
      method: 'GET'
    }, () => pt, (err) => {
      t.error(err)
      t.strictEqual(pt.destroyed, false)
    })
  })
})

test('stream args validation', (t) => {
  t.plan(3)

  const client = new Client('http://localhost:5000')
  client.stream({
    path: '/',
    method: 'GET'
  }, null, (err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  client.stream(null, null, (err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.stream(null, null, 'asd')
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('stream args validation promise', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')
  client.stream({
    path: '/',
    method: 'GET'
  }, null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  client.stream(null, null).catch((err) => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('stream waits only for writable side', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      throw new Error('kaboom')
    }, (err) => {
      t.strictEqual(err.message, 'kaboom')
    })
  })
})

test('stream server side destroy', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      t.fail()
    }, (err) => {
      t.ok(err instanceof errors.SocketError)
    })
  })
})

test('stream invalid return', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.write('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return {}
    }, (err) => {
      t.ok(err instanceof errors.InvalidReturnValueError)
    })
  })
})
