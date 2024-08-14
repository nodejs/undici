'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const { PassThrough, Writable, Readable } = require('node:stream')
const EE = require('node:events')

test('stream get', async (t) => {
  t = tspl(t, { plan: 9 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const signal = new EE()
    client.stream({
      signal,
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
      t.strictEqual(signal.listenerCount('abort'), 0)
      t.ifError(err)
    })
    t.strictEqual(signal.listenerCount('abort'), 1)
  })

  await t.completed
})

test('stream promise get', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    await client.stream({
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
    })
  })

  await t.completed
})

test('stream GET destroy res', async (t) => {
  t = tspl(t, { plan: 14 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
      t.ifError(err)
    })
  })

  await t.completed
})

test('stream GET remote destroy', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.write('asd')
    setImmediate(() => {
      res.destroy()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('stream response resume back pressure and non standard error', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    res.write(Buffer.alloc(1e3))
    setImmediate(() => {
      res.write(Buffer.alloc(1e7))
      res.end()
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const pt = new PassThrough()
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      pt.on('data', () => {
        pt.emit('error', new Error('kaboom'))
      }).once('error', (err) => {
        t.strictEqual(err.message, 'kaboom')
      })
      return pt
    }, (err) => {
      t.ok(err)
      t.strictEqual(pt.destroyed, true)
    })

    client.once('disconnect', (err) => {
      t.ok(err)
    })

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough()
      pt.resume()
      return pt
    }, (err) => {
      t.ifError(err)
    })
  })

  await t.completed
})

test('stream waits only for writable side', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(1e3))
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const pt = new PassThrough({ autoDestroy: false })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => pt, (err) => {
      t.ifError(err)
      t.strictEqual(pt.destroyed, false)
    })
  })

  await t.completed
})

test('stream args validation', async (t) => {
  t = tspl(t, { plan: 3 })

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

test('stream args validation promise', async (t) => {
  t = tspl(t, { plan: 2 })

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

  await t.completed
})

test('stream destroy if not readable', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  const pt = new PassThrough()
  pt.readable = false
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return pt
    }, (err) => {
      t.ifError(err)
      t.strictEqual(pt.destroyed, true)
    })
  })

  await t.completed
})

test('stream server side destroy', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.destroy()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      t.fail()
    }, (err) => {
      t.ok(err instanceof errors.SocketError)
    })
  })

  await t.completed
})

test('stream invalid return', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.write('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return {}
    }, (err) => {
      t.ok(err instanceof errors.InvalidReturnValueError)
    })
  })

  await t.completed
})

test('stream body without destroy', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough({ autoDestroy: false })
      pt.destroy = null
      pt.resume()
      return pt
    }, (err) => {
      t.ifError(err)
    })
  })

  await t.completed
})

test('stream factory abort', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      signal.emit('abort')
      return new PassThrough()
    }, (err) => {
      t.strictEqual(signal.listenerCount('abort'), 0)
      t.ok(err instanceof errors.RequestAbortedError)
    })
    t.strictEqual(signal.listenerCount('abort'), 1)
  })

  await t.completed
})

test('stream factory throw', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      throw new Error('asd')
    }, (err) => {
      t.strictEqual(err.message, 'asd')
    })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      throw new Error('asd')
    }, (err) => {
      t.strictEqual(err.message, 'asd')
    })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return new PassThrough()
    }, (err) => {
      t.ifError(err)
    })
  })

  await t.completed
})

test('stream CONNECT throw', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'CONNECT'
    }, () => {
    }, (err) => {
      t.ok(err instanceof errors.InvalidArgumentError)
    })
  })

  await t.completed
})

test('stream abort after complete', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    const pt = new PassThrough()
    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      return pt
    }, (err) => {
      t.ifError(err)
      signal.emit('abort')
    })
  })

  await t.completed
})

test('stream abort before dispatch', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    const pt = new PassThrough()
    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      return pt
    }, (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
    signal.emit('abort')
  })

  await t.completed
})

test('trailers', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.stream({
      path: '/',
      method: 'GET'
    }, () => new PassThrough(), (err, data) => {
      t.ifError(err)
      t.deepStrictEqual(data.trailers, { 'content-md5': 'test' })
    })
  })

  await t.completed
})

test('stream ignore 1xx', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    let buf = ''
    client.stream({
      path: '/',
      method: 'GET'
    }, () => new Writable({
      write (chunk, encoding, callback) {
        buf += chunk
        callback()
      }
    }), (err, data) => {
      t.ifError(err)
      t.strictEqual(buf, 'hello')
    })
  })

  await t.completed
})

test('stream ignore 1xx and use onInfo', async (t) => {
  t = tspl(t, { plan: 4 })

  const infos = []
  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    let buf = ''
    client.stream({
      path: '/',
      method: 'GET',
      onInfo: (x) => {
        infos.push(x)
      }
    }, () => new Writable({
      write (chunk, encoding, callback) {
        buf += chunk
        callback()
      }
    }), (err, data) => {
      t.ifError(err)
      t.strictEqual(buf, 'hello')
      t.strictEqual(infos.length, 1)
      t.strictEqual(infos[0].statusCode, 102)
    })
  })

  await t.completed
})

test('stream backpressure', async (t) => {
  t = tspl(t, { plan: 2 })

  const expected = Buffer.alloc(1e6).toString()

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end(expected)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    let buf = ''
    client.stream({
      path: '/',
      method: 'GET'
    }, () => new Writable({
      highWaterMark: 1,
      write (chunk, encoding, callback) {
        buf += chunk
        process.nextTick(callback)
      }
    }), (err, data) => {
      t.ifError(err)
      t.strictEqual(buf, expected)
    })
  })

  await t.completed
})

test('stream body destroyed on invalid callback', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(client.destroy.bind(client))

    const body = new Readable({
      read () { }
    })
    try {
      client.stream({
        path: '/',
        method: 'GET',
        body
      }, () => { }, null)
    } catch (err) {
      t.strictEqual(body.destroyed, true)
    }
  })

  await t.completed
})

test('stream needDrain', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4096))
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => {
      client.destroy()
    })

    const dst = new PassThrough()
    dst.pause()

    if (dst.writableNeedDrain === undefined) {
      Object.defineProperty(dst, 'writableNeedDrain', {
        get () {
          return this._writableState.needDrain
        }
      })
    }

    while (dst.write(Buffer.alloc(4096))) {
      // Do nothing.
    }

    const orgWrite = dst.write
    dst.write = () => t.fail()
    const p = client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      t.strictEqual(dst._writableState.needDrain, true)
      t.strictEqual(dst.writableNeedDrain, true)

      setImmediate(() => {
        dst.write = (...args) => {
          orgWrite.call(dst, ...args)
        }
        dst.resume()
      })

      return dst
    })

    p.then(() => {
      t.ok(true, 'pass')
    })
  })

  await t.completed
})

test('stream legacy needDrain', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4096))
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => {
      client.destroy()
    })

    const dst = new PassThrough()
    dst.pause()

    if (dst.writableNeedDrain !== undefined) {
      Object.defineProperty(dst, 'writableNeedDrain', {
        get () {
        }
      })
    }

    while (dst.write(Buffer.alloc(4096))) {
      // Do nothing
    }

    const orgWrite = dst.write
    dst.write = () => t.fail()
    const p = client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      t.strictEqual(dst._writableState.needDrain, true)
      t.strictEqual(dst.writableNeedDrain, undefined)

      setImmediate(() => {
        dst.write = (...args) => {
          orgWrite.call(dst, ...args)
        }
        dst.resume()
      })

      return dst
    })

    p.then(() => {
      t.ok(true, 'pass')
    })
  })
  await t.completed
})
