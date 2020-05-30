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
    const buf1 = Buffer.alloc(1e3).toString()
    const buf2 = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf1)
          this.push(buf2)
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
          t.strictEqual(buf1 + buf2, res)
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

test('pipeline invalid handler return after destroy should not error', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.destroy.bind(client))

    const dup = client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      body.on('error', (err) => {
        t.strictEqual(err.message, 'asd')
      })
      dup.destroy(new Error('asd'))
      return {}
    })
      .on('error', (err) => {
        t.strictEqual(err.message, 'asd')
      })
      .on('close', () => {
        t.pass()
      })
      .end()
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
  t.plan(2)

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
        t.ok(err instanceof errors.InvalidReturnValueError)
      })
      .end()

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      // TODO: Should body cause unhandled exception?
      body.on('error', () => {})
      return {}
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.InvalidReturnValueError)
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

test('pipeline destroy and throw handler', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const dup = client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      dup.destroy()
      // TODO: Should body cause unhandled exception?
      body.on('error', () => {})
      throw new Error('asd')
    })
      .end()
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      .on('close', () => {
        t.pass()
      })
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
  t.plan(3)

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
      }).destroy().on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })

      client.on('disconnect', () => {
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
        // Node < 13 doesn't always detect premature close.
        if (process.versions.node.split('.')[0] < 13) {
          t.ok(err instanceof errors.RequestAbortedError)
        } else {
          t.strictEqual(err.code, 'ERR_STREAM_PREMATURE_CLOSE')
        }
      })
      .end()
  })
})

test('pipeline abort piped res 2', (t) => {
  t.plan(2)

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
      body.on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      setImmediate(() => {
        pt.destroy()
      })
      body.pipe(pt)
      return pt
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      .end()
  })
})

test('pipeline abort piped res 3', (t) => {
  t.plan(2)

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
      body.on('error', (err) => {
        t.strictEqual(err.message, 'asd')
      })
      setImmediate(() => {
        pt.destroy(new Error('asd'))
      })
      body.pipe(pt)
      return pt
    })
      .on('error', (err) => {
        t.strictEqual(err.message, 'asd')
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

test('pipeline w/ write abort server res after headers', (t) => {
  t.plan(1)

  let _res
  const server = createServer((req, res) => {
    req.pipe(res)
    _res = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'PUT'
    }, (data) => {
      _res.destroy()
      return data.body
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.SocketError)
      })
      .resume()
      .write('asd')
  })
})
