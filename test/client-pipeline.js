'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const EE = require('node:events')
const { createServer } = require('node:http')
const {
  pipeline,
  Readable,
  Transform,
  Writable,
  PassThrough
} = require('node:stream')

test('pipeline get', async (t) => {
  t = tspl(t, { plan: 17 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    t.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    t.strictEqual(undefined, req.headers['content-length'])
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('pipeline echo', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
        t.ifError(err)
      }
    )
  })

  await t.completed
})

test('pipeline ignore request body', async (t) => {
  t = tspl(t, { plan: 2 })

  let done
  const server = createServer((req, res) => {
    res.write('asd')
    res.end()
    done()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
        t.ifError(err)
      }
    )
  })

  await t.completed
})

test('pipeline invalid handler', async (t) => {
  t = tspl(t, { plan: 1 })

  const client = new Client('http://localhost:5000')
  client.pipeline({}, null).on('error', (err) => {
    t.ok(/handler/.test(err))
  })

  await t.completed
})

test('pipeline invalid handler return after destroy should not error', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    after(() => client.destroy())

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
        t.ok(true, 'pass')
      })
      .end()
  })

  await t.completed
})

test('pipeline error body', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('pipeline destroy body', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('pipeline backpressure', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
      t.ok(true, 'pass')
    })
  })

  await t.completed
})

test('pipeline invalid handler return', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline throw handler', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline destroy and throw handler', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
        t.ok(true, 'pass')
      })
  })

  await t.completed
})

test('pipeline abort res', async (t) => {
  t = tspl(t, { plan: 2 })

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
          t.ok(true, 'pass')
        })
      })
      return body
    })
      .on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
      .end()
  })

  await t.completed
})

test('pipeline abort server res', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.destroy()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline abort duplex', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      path: '/',
      method: 'PUT'
    }, (err, data) => {
      t.ifError(err)
      data.body.resume()

      client.pipeline({
        path: '/',
        method: 'PUT'
      }, () => {
        t.fail()
      }).destroy().on('error', (err) => {
        t.ok(err instanceof errors.RequestAbortedError)
      })
    })
  })

  await t.completed
})

test('pipeline abort piped res', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.write('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
        t.strictEqual(err.code, 'UND_ERR_ABORTED')
      })
      .end()
  })

  await t.completed
})

test('pipeline abort piped res 2', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.write('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline abort piped res 3', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.write('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline abort server res after headers', async (t) => {
  t = tspl(t, { plan: 1 })

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline w/ write abort server res after headers', async (t) => {
  t = tspl(t, { plan: 1 })

  let _res
  const server = createServer((req, res) => {
    req.pipe(res)
    _res = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('destroy in push', async (t) => {
  t = tspl(t, { plan: 3 })

  let _res
  const server = createServer((req, res) => {
    res.write('asd')
    _res = res
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('pipeline args validation', async (t) => {
  t = tspl(t, { plan: 2 })

  const client = new Client('http://localhost:5000')

  const ret = client.pipeline(null, () => {})
  ret.on('error', (err) => {
    t.ok(/opts/.test(err.message))
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  await t.completed
})

test('pipeline factory throw not unhandled', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.write('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline destroy before dispatch', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline legacy stream', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.write(Buffer.alloc(16e3))
    setImmediate(() => {
      res.end(Buffer.alloc(16e3))
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client
      .pipeline({ path: '/', method: 'GET' }, ({ body }) => {
        const pt = new PassThrough()
        pt.pause = null
        return body.pipe(pt)
      })
      .resume()
      .on('end', () => {
        t.ok(true, 'pass')
      })
      .end()
  })

  await t.completed
})

test('pipeline objectMode', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end(JSON.stringify({ asd: 1 }))
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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
        t.deepStrictEqual(data, { asd: 1 })
      })
      .end()
  })

  await t.completed
})

test('pipeline invalid opts', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end(JSON.stringify({ asd: 1 }))
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.close((err) => {
      t.ifError(err)
    })
    client
      .pipeline({ path: '/', method: 'GET', objectMode: true }, ({ body }) => {
        t.fail()
      })
      .on('error', (err) => {
        t.ok(err)
      })
  })

  await t.completed
})

test('pipeline CONNECT throw', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})

test('pipeline body without destroy', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
        t.ok(true, 'pass')
      })
      .resume()
  })

  await t.completed
})

test('pipeline ignore 1xx', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

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

  await t.completed
})

test('pipeline ignore 1xx and use onInfo', async (t) => {
  t = tspl(t, { plan: 3 })

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
    client.pipeline({
      path: '/',
      method: 'GET',
      onInfo: (x) => {
        infos.push(x)
      }
    }, ({ body }) => body)
      .on('data', (chunk) => {
        buf += chunk
      })
      .on('end', () => {
        t.strictEqual(buf, 'hello')
        t.strictEqual(infos.length, 1)
        t.strictEqual(infos[0].statusCode, 102)
      })
      .end()
  })

  await t.completed
})

test('pipeline backpressure', async (t) => {
  t = tspl(t, { plan: 1 })

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

  await t.completed
})

test('pipeline abort after headers', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.writeProcessing()
    res.write('asd')
    setImmediate(() => {
      res.write('asd')
    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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

  await t.completed
})
