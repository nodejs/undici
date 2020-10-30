'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const EE = require('events')
const { createServer } = require('http')
const {
  pipeline,
  Readable,
  Transform,
  Writable,
  PassThrough
} = require('stream')

test('pipeline get', (t) => {
  t.plan(17)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    {
      const bufs = []
      const signal = new EE()
      client.pipeline({ signal, path: '/', method: 'GET' }, ({ statusCode, headers, body }) => {
        t.strictEqual(statusCode, 200)
        t.strictEqual(headers['content-type'], 'text/plain')
        t.strictEqual(signal.listenerCount('abort'), 1)
        return body
      })
        .end()
        .on('data', (buf) => {
          bufs.push(buf)
        })
        .on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
        .on('close', () => {
          t.strictEqual(signal.listenerCount('abort'), 0)
        })
      t.strictEqual(signal.listenerCount('abort'), 1)
    }

    {
      const bufs = []
      client.pipeline({ path: '/', method: 'GET' }, ({ statusCode, headers, body }) => {
        t.strictEqual(statusCode, 200)
        t.strictEqual(headers['content-type'], 'text/plain')
        return body
      })
        .end()
        .on('data', (buf) => {
          bufs.push(buf)
        })
        .on('end', () => {
          t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
        })
    }
  })
})

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
      }),
      new Writable({
        write (chunk, encoding, callback) {
          res += chunk.toString()
          callback()
        },
        final (callback) {
          t.strictEqual(res, buf1 + buf2)
          callback()
        }
      }),
      (err) => {
        t.error(err)
      }
    )
  })
})

test('pipeline ignore request body', (t) => {
  t.plan(2)

  let done
  const server = createServer((req, res) => {
    res.write('asd')
    res.end()
    done()
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
          done = () => this.push(null)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, ({ body }) => {
        return pipeline(body, new PassThrough(), () => {})
      }),
      new Writable({
        write (chunk, encoding, callback) {
          res += chunk.toString()
          callback()
        },
        final (callback) {
          t.strictEqual(res, 'asd')
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
  t.plan(2)

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
    }, ({ body }) => {
      setImmediate(() => {
        body.destroy()
        _res.write('asdasdadasd')
        const timeout = setTimeout(() => {
          t.fail()
        }, 100)
        client.on('disconnect', () => {
          clearTimeout(timeout)
          t.pass()
        })
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
      }).destroy().on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })

      client.on('disconnect', () => {
        t.fail()
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
          t.ok(err)
        } else {
          t.strictEqual(err.code, 'UND_ERR_ABORTED')
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

test('destroy in push', (t) => {
  t.plan(3)

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.pipeline({ path: '/', method: 'GET' }, ({ body }) => {
      body.once('data', () => {
        _res.write('asd')
        body.on('data', (buf) => {
          body.destroy()
          _res.end()
        }).on('error', (err) => {
          t.ok(err)
        })
      })
      return body
    }).on('error', (err) => {
      t.ok(err)
    }).resume().end()

    client.pipeline({ path: '/', method: 'GET' }, ({ body }) => {
      let buf = ''
      body.on('data', (chunk) => {
        buf = chunk.toString()
        _res.end()
      }).on('end', () => {
        t.strictEqual('asd', buf)
      })
      return body
    }).resume().end()
  })
})

test('pipeline args validation', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5000')

  const ret = client.pipeline(null, () => {})
  ret.on('error', (err) => {
    t.ok(/opts/.test(err.message))
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('pipeline factory throw not unhandled', (t) => {
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
    }, (data) => {
      throw new Error('asd')
    })
      .on('error', (err) => {
        t.ok(err)
      })
      .end()
  })
})

test('pipeline destroy before dispatch', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client
      .pipeline({ path: '/', method: 'GET' }, ({ body }) => {
        return body
      })
      .on('error', (err) => {
        t.ok(err)
      })
      .end()
      .destroy()
  })
})

test('pipeline legacy stream', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.write(Buffer.alloc(16e3))
    setImmediate(() => {
      res.end(Buffer.alloc(16e3))
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client
      .pipeline({ path: '/', method: 'GET' }, ({ body }) => {
        const pt = new PassThrough()
        pt.pause = null
        return body.pipe(pt)
      })
      .resume()
      .on('end', () => {
        t.pass()
      })
      .end()
  })
})

test('pipeline objectMode', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end(JSON.stringify({ asd: 1 }))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client
      .pipeline({ path: '/', method: 'GET', objectMode: true }, ({ body }) => {
        return pipeline(body, new Transform({
          readableObjectMode: true,
          transform (chunk, encoding, callback) {
            callback(null, JSON.parse(chunk))
          }
        }), () => {})
      })
      .on('data', data => {
        t.strictDeepEqual(data, { asd: 1 })
      })
      .end()
  })
})

test('pipeline invalid opts', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end(JSON.stringify({ asd: 1 }))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.close((err) => {
      t.error(err)
    })
    client
      .pipeline({ path: '/', method: 'GET', objectMode: true }, ({ body }) => {
        t.fail()
      })
      .on('error', (err) => {
        t.ok(err)
      })
  })
})

test('pipeline CONNECT throw', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'CONNECT'
    }, () => {
      t.fail()
    }).on('error', (err) => {
      t.ok(err instanceof errors.InvalidArgumentError)
    })
    client.on('disconnect', () => {
      t.fail()
    })
  })
})

test('pipeline body without destroy', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => {
      const pt = new PassThrough({ autoDestroy: false })
      pt.destroy = null
      return body.pipe(pt)
    })
      .end()
      .on('end', () => {
        t.pass()
      })
      .resume()
  })
})

test('pipeline ignore 1xx', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    let buf = ''
    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => body)
      .on('data', (chunk) => {
        buf += chunk
      })
      .on('end', () => {
        t.strictEqual(buf, 'hello')
      })
      .end()
  })
})

test('pipeline backpressure', (t) => {
  t.plan(1)

  const expected = Buffer.alloc(1e6).toString()

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end(expected)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    let buf = ''
    client.pipeline({
      path: '/',
      method: 'GET'
    }, ({ body }) => body)
      .end()
      .pipe(new Transform({
        highWaterMark: 1,
        transform (chunk, encoding, callback) {
          setImmediate(() => {
            callback(null, chunk)
          })
        }
      }))
      .on('data', chunk => {
        buf += chunk
      })
      .on('end', () => {
        t.strictEqual(buf, expected)
      })
  })
})

test('pipeline abort after headers', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.write('asd')
    setImmediate(() => {
      res.write('asd')
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const signal = new EE()
    client.pipeline({
      path: '/',
      method: 'GET',
      signal
    }, ({ body }) => {
      process.nextTick(() => {
        signal.emit('abort')
      })
      return body
    })
      .end()
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
  })
})
