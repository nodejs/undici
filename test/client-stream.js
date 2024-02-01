'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('node:http')
const { PassThrough, Writable, Readable } = require('node:stream')
const EE = require('node:events')

test('stream get', (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const signal = new EE()
    client.stream({
      signal,
      path: '/',
      method: 'GET',
      opaque: new PassThrough()
    }, ({ statusCode, headers, opaque: pt }) => {
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      pt.on('data', (buf) => {
        bufs.push(buf)
      })
      pt.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
      return pt
    }, (err) => {
      t.equal(signal.listenerCount('abort'), 0)
      t.error(err)
    })
    t.equal(signal.listenerCount('abort'), 1)
  })
})

test('stream promise get', (t) => {
  t.plan(6)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    await client.stream({
      path: '/',
      method: 'GET',
      opaque: new PassThrough()
    }, ({ statusCode, headers, opaque: pt }) => {
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')
      const bufs = []
      pt.on('data', (buf) => {
        bufs.push(buf)
      })
      pt.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
      return pt
    })
  })
})

test('stream GET destroy res', (t) => {
  t.plan(14)

  const server = createServer((req, res) => {
    t.equal('/', req.url)
    t.equal('GET', req.method)
    t.equal(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, ({ statusCode, headers }) => {
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')

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
      t.equal(statusCode, 200)
      t.equal(headers['content-type'], 'text/plain')

      let ret = ''
      const pt = new PassThrough()
      pt.on('data', chunk => {
        ret += chunk
      }).on('end', () => {
        t.equal(ret, 'hello')
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
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const pt = new PassThrough()
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      pt.on('data', () => {
        pt.emit('error', new Error('kaboom'))
      }).once('error', (err) => {
        t.equal(err.message, 'kaboom')
      })
      return pt
    }, (err) => {
      t.ok(err)
      t.equal(pt.destroyed, true)
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
      t.error(err)
    })
  })
})

test('stream waits only for writable side', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(1e3))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const pt = new PassThrough({ autoDestroy: false })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => pt, (err) => {
      t.error(err)
      t.equal(pt.destroyed, false)
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
    t.type(err, errors.InvalidArgumentError)
  })

  client.stream(null, null, (err) => {
    t.type(err, errors.InvalidArgumentError)
  })

  try {
    client.stream(null, null, 'asd')
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
  }
})

test('stream args validation promise', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')
  client.stream({
    path: '/',
    method: 'GET'
  }, null).catch((err) => {
    t.type(err, errors.InvalidArgumentError)
  })

  client.stream(null, null).catch((err) => {
    t.type(err, errors.InvalidArgumentError)
  })
})

test('stream destroy if not readable', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  const pt = new PassThrough()
  pt.readable = false
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return pt
    }, (err) => {
      t.error(err)
      t.equal(pt.destroyed, true)
    })
  })
})

test('stream server side destroy', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.destroy()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      t.fail()
    }, (err) => {
      t.type(err, errors.SocketError)
    })
  })
})

test('stream invalid return', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.write('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return {}
    }, (err) => {
      t.type(err, errors.InvalidReturnValueError)
    })
  })
})

test('stream body without destroy', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      const pt = new PassThrough({ autoDestroy: false })
      pt.destroy = null
      pt.resume()
      return pt
    }, (err) => {
      t.error(err)
    })
  })
})

test('stream factory abort', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      signal.emit('abort')
      return new PassThrough()
    }, (err) => {
      t.equal(signal.listenerCount('abort'), 0)
      t.type(err, errors.RequestAbortedError)
    })
    t.equal(signal.listenerCount('abort'), 1)
  })
})

test('stream factory throw', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      throw new Error('asd')
    }, (err) => {
      t.equal(err.message, 'asd')
    })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      throw new Error('asd')
    }, (err) => {
      t.equal(err.message, 'asd')
    })
    client.stream({
      path: '/',
      method: 'GET'
    }, () => {
      return new PassThrough()
    }, (err) => {
      t.error(err)
    })
  })
})

test('stream CONNECT throw', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.stream({
      path: '/',
      method: 'CONNECT'
    }, () => {
    }, (err) => {
      t.type(err, errors.InvalidArgumentError)
    })
  })
})

test('stream abort after complete', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const pt = new PassThrough()
    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      return pt
    }, (err) => {
      t.error(err)
      signal.emit('abort')
    })
  })
})

test('stream abort before dispatch', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const pt = new PassThrough()
    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, () => {
      return pt
    }, (err) => {
      t.type(err, errors.RequestAbortedError)
    })
    signal.emit('abort')
  })
})

test('trailers', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(200, { Trailer: 'Content-MD5' })
    res.addTrailers({ 'Content-MD5': 'test' })
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.stream({
      path: '/',
      method: 'GET'
    }, () => new PassThrough(), (err, data) => {
      t.error(err)
      t.strictSame(data.trailers, { 'content-md5': 'test' })
    })
  })
})

test('stream ignore 1xx', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
      t.error(err)
      t.equal(buf, 'hello')
    })
  })
})

test('stream ignore 1xx and use onInfo', (t) => {
  t.plan(4)

  const infos = []
  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
      t.error(err)
      t.equal(buf, 'hello')
      t.equal(infos.length, 1)
      t.equal(infos[0].statusCode, 102)
    })
  })
})

test('stream backpressure', (t) => {
  t.plan(2)

  const expected = Buffer.alloc(1e6).toString()

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end(expected)
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
      t.error(err)
      t.equal(buf, expected)
    })
  })
})

test('stream body destroyed on invalid callback', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    const body = new Readable({
      read () {}
    })
    try {
      client.stream({
        path: '/',
        method: 'GET',
        body
      }, () => {}, null)
    } catch (err) {
      t.equal(body.destroyed, true)
    }
  })
})

test('stream needDrain', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4096))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(() => {
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
      t.equal(dst._writableState.needDrain, true)
      t.equal(dst.writableNeedDrain, true)

      setImmediate(() => {
        dst.write = (...args) => {
          orgWrite.call(dst, ...args)
        }
        dst.resume()
      })

      return dst
    })

    p.then(() => {
      t.pass()
    })
  })
})

test('stream legacy needDrain', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4096))
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(() => {
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
      t.equal(dst._writableState.needDrain, true)
      t.equal(dst.writableNeedDrain, undefined)

      setImmediate(() => {
        dst.write = (...args) => {
          orgWrite.call(dst, ...args)
        }
        dst.resume()
      })

      return dst
    })

    p.then(() => {
      t.pass()
    })
  })

  test('stream throwOnError', (t) => {
    t.plan(2)

    const errStatusCode = 500
    const errMessage = 'Internal Server Error'

    const server = createServer((req, res) => {
      res.writeHead(errStatusCode, { 'Content-Type': 'text/plain' })
      res.end(errMessage)
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.close.bind(client))

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
      }, (e) => {
        t.equal(e.status, errStatusCode)
        t.equal(e.body, errMessage)
        t.end()
      })
    })
  })

  test('steam throwOnError=true, error on stream', (t) => {
    t.plan(1)

    const server = createServer((req, res) => {
      res.end('asd')
    })
    t.teardown(server.close.bind(server))

    server.listen(0, async () => {
      const client = new Client(`http://localhost:${server.address().port}`)
      t.teardown(client.close.bind(client))

      client.stream({
        path: '/',
        method: 'GET',
        throwOnError: true,
        opaque: new PassThrough()
      }, () => {
        throw new Error('asd')
      }, (e) => {
        t.equal(e.message, 'asd')
      })
    })
  })
})
