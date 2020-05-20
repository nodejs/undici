'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const {
  pipeline,
  Readable,
  Writable,
  PassThrough
} = require('stream')

test('pipeline echo', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    let res = ''
    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
          this.push(null)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, ({ body }) => {
        return pipeline(body, new PassThrough(), () => {})
      }, (err) => {
        t.error(err)
      }),
      new Writable({
        write (chunk, encoding, callback) {
          res += chunk.toString()
          callback()
        },
        final (callback) {
          t.strictEqual(buf, res)
          callback()
        }
      }),
      (err) => {
        t.error(err)
      }
    )
  })
})

test('pipeline invalid handler', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')
  client.pipeline({}, null).on('error', (err) => {
    t.ok(/handler/.test(err))
  })
})

test('pipeline error body', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, ({ body }) => {
        const pt = new PassThrough()
        process.nextTick(() => {
          pt.destroy(new Error('asd'))
        })
        body.on('error', (err) => {
          t.ok(err)
        })
        return pipeline(body, pt, () => {})
      }, (err) => {
        t.error(err)
      }),
      new PassThrough(),
      (err) => {
        t.ok(err)
      }
    )
  })
})

test('pipeline destroy body', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, ({ body }) => {
        const pt = new PassThrough()
        process.nextTick(() => {
          pt.destroy()
        })
        body.on('error', (err) => {
          t.ok(err)
        })
        return pipeline(body, pt, () => {})
      }, (err) => {
        t.error(err)
      }),
      new PassThrough(),
      (err) => {
        t.ok(err)
      }
    )
  })
})

test('pipeline backpressure', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const buf = Buffer.alloc(1e6).toString()
    const duplex = client.pipeline({
      path: '/',
      method: 'PUT'
    }, ({ body }) => {
      const pt = new PassThrough()
      return pipeline(body, pt, () => {})
    })

    duplex.end(buf)
    duplex.on('data', () => {
      duplex.pause()
      setImmediate(() => {
        duplex.resume()
      })
    }).on('end', () => {
      t.pass()
    })
  })
})

test('pipeline invalid handler return', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      // TODO: Should body cause unhandled exception?
      body.on('error', () => {})
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.InvalidArgumentError)
      })
      .end()
  })
})

test('pipeline throw handler', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      // TODO: Should body cause unhandled exception?
      body.on('error', () => {})
      throw new Error('asd')
    })
      .on('error', (err) => {
        t.strictEqual(err.message, 'asd')
      })
      .end()
  })
})

test('pipeline abort res', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.write('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      setImmediate(() => {
        body.destroy()
      })
      return body
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      .end()
  })
})

test('pipeline abort server res', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, () => {
      t.fail()
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.SocketError)
      })
      .end()
  })
})

test('pipeline abort duplex', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'PUT'
    }, (err, data) => {
      t.error(err)
      data.body.resume()

      client.pipeline({
        path: '/',
        method: 'PUT'
      }, () => {
        t.fail()
      }).destroy()

      client.on('reconnect', () => {
        t.pass()
      })
    })
  })
})

test('pipeline abort piped res', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.write('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      const pt = new PassThrough()
      setImmediate(() => {
        pt.destroy()
      })
      return pipeline(body, pt, () => {})
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      .end()
  })
})

test('pipeline abort server res after headers', (t) => {
  t.plan(1)

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, (data) => {
      _res.destroy()
      return data.body
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.SocketError)
      })
      .end()
  })
})
