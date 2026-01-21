'use strict'

const { describe, test, after } = require('node:test')
const { once } = require('node:events')
const http = require('node:http')
const { PassThrough } = require('node:stream')
const { kRunning } = require('../../lib/core/symbols')
const {
  Agent,
  errors,
  request,
  stream,
  pipeline,
  Pool,
  setGlobalDispatcher,
  getGlobalDispatcher
} = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

describe('setGlobalDispatcher', () => {
  after(() => {
    // reset globalAgent to a fresh Agent instance for later tests
    setGlobalDispatcher(new Agent())
  })
  test('fails if agent does not implement `get` method', t => {
    t.plan(1)
    t.assert.throws(() => setGlobalDispatcher({ dispatch: 'not a function' }), errors.InvalidArgumentError)
  })
  test('sets global agent', async t => {
    t.plan(2)
    t.assert.doesNotThrow(() => setGlobalDispatcher(new Agent()))
    t.assert.doesNotThrow(() => setGlobalDispatcher({ dispatch: () => {} }))
  })
})

test('Agent', t => {
  t.plan(1)

  t.assert.doesNotThrow(() => new Agent())
})

test('Agent enforces maxOrigins', async (t) => {
  t.plan(1)

  const dispatcher = new Agent({
    maxOrigins: 1,
    keepAliveMaxTimeout: 100,
    keepAliveTimeout: 100
  })
  t.after(() => dispatcher.close())

  const handler = (_req, res) => {
    setTimeout(() => res.end('ok'), 50)
  }

  const server1 = http.createServer({ joinDuplicateHeaders: true }, handler)
  server1.listen(0)
  await once(server1, 'listening')
  t.after(closeServerAsPromise(server1))

  const server2 = http.createServer({ joinDuplicateHeaders: true }, handler)
  server2.listen(0)
  await once(server2, 'listening')
  t.after(closeServerAsPromise(server2))

  try {
    await Promise.all([
      request(`http://localhost:${server1.address().port}`, { dispatcher }),
      request(`http://localhost:${server2.address().port}`, { dispatcher })
    ])
  } catch (err) {
    t.assert.ok(err instanceof errors.MaxOriginsReachedError)
  }
})

test('agent should call callback after closing internal pools', (t, done) => {
  t.plan(2)

  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const dispatcher = new Agent()

    const origin = `http://localhost:${server.address().port}`

    request(origin, { dispatcher })
      .then(() => {
        // first request should resolve
        t.assert.ok(1)
      })
      .catch(err => {
        t.assert.fail(err)
      })

    dispatcher.once('connect', () => {
      dispatcher.close(() => {
        request(origin, { dispatcher })
          .then(() => {
            t.assert.fail('second request should not resolve')
          })
          .catch(err => {
            t.assert.ok(err instanceof errors.ClientDestroyedError)
            done()
          })
      })
    })
  })
})

test('agent close throws when callback is not a function', t => {
  t.plan(1)
  const dispatcher = new Agent()
  try {
    dispatcher.close({})
  } catch (err) {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('agent should close internal pools', (t, done) => {
  t.plan(2)

  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const dispatcher = new Agent()

    const origin = `http://localhost:${server.address().port}`

    request(origin, { dispatcher })
      .then(() => {
        // first request should resolve
        t.assert.ok(1)
      })
      .catch(err => {
        t.assert.fail(err)
      })

    dispatcher.once('connect', () => {
      dispatcher.close()
        .then(() => request(origin, { dispatcher }))
        .then(() => {
          t.assert.fail('second request should not resolve')
        })
        .catch(err => {
          t.assert.ok(err instanceof errors.ClientDestroyedError)
          done()
        })
    })
  })
})

test('agent should destroy internal pools and call callback', (t, done) => {
  t.plan(2)

  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const dispatcher = new Agent()

    const origin = `http://localhost:${server.address().port}`

    request(origin, { dispatcher })
      .then(() => {
        t.assert.fail()
      })
      .catch(err => {
        t.assert.ok(err instanceof errors.ClientDestroyedError)
      })

    dispatcher.once('connect', () => {
      dispatcher.destroy(() => {
        request(origin, { dispatcher })
          .then(() => {
            t.assert.fail()
          })
          .catch(err => {
            t.assert.ok(err instanceof errors.ClientDestroyedError)
            done()
          })
      })
    })
  })
})

test('agent destroy throws when callback is not a function', t => {
  t.plan(1)
  const dispatcher = new Agent()
  try {
    dispatcher.destroy(new Error('mock error'), {})
  } catch (err) {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('agent close/destroy callback with error', t => {
  t.plan(4)
  const dispatcher = new Agent()
  t.assert.strictEqual(dispatcher.closed, false)
  dispatcher.close()
  t.assert.strictEqual(dispatcher.closed, true)
  t.assert.strictEqual(dispatcher.destroyed, false)
  dispatcher.destroy(new Error('mock error'))
  t.assert.strictEqual(dispatcher.destroyed, true)
})

test('agent should destroy internal pools', (t, done) => {
  t.plan(2)

  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const dispatcher = new Agent()

    const origin = `http://localhost:${server.address().port}`

    request(origin, { dispatcher })
      .then(() => {
        t.assert.fail()
      })
      .catch(err => {
        t.assert.ok(err instanceof errors.ClientDestroyedError)
      })

    dispatcher.once('connect', () => {
      dispatcher.destroy()
        .then(() => request(origin, { dispatcher }))
        .then(() => {
          t.assert.fail()
        })
        .catch(err => {
          t.assert.ok(err instanceof errors.ClientDestroyedError)
          done()
        })
    })
  })
})

test('multiple connections', (t, done) => {
  const connections = 3
  t.plan(6 * connections)

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=1s'
    })
    res.end('ok')
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    let callCount = 0
    const origin = `http://localhost:${server.address().port}`
    const dispatcher = new Agent({ connections })

    t.after(() => { dispatcher.close.bind(dispatcher)() })

    dispatcher.on('connect', (origin, [dispatcher]) => {
      t.assert.ok(dispatcher)
    })
    dispatcher.on('disconnect', (origin, [dispatcher], error) => {
      t.assert.ok(dispatcher)
      t.assert.ok(error instanceof errors.InformationalError)
      t.assert.strictEqual(error.code, 'UND_ERR_INFO')
      t.assert.strictEqual(error.message, 'reset')

      if (++callCount === connections) done()
    })

    for (let i = 0; i < connections; i++) {
      try {
        await request(origin, { dispatcher })
        t.assert.ok(1)
      } catch (err) {
        t.assert.fail(err)
      }
    }
  })
})

test('agent factory supports URL parameter', (t, done) => {
  t.plan(2)

  const noopHandler = {
    onConnect () {},
    onHeaders () {},
    onData () {},
    onComplete () {
      server.close()
    },
    onError (err) {
      throw err
    }
  }

  const dispatcher = new Agent({
    factory: (origin, opts) => {
      t.assert.ok(origin instanceof URL)
      return new Pool(origin, opts)
    }
  })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('asd')
  })

  server.listen(0, () => {
    t.assert.doesNotThrow(() => dispatcher.dispatch({
      origin: new URL(`http://localhost:${server.address().port}`),
      path: '/',
      method: 'GET'
    }, noopHandler))
    done()
  })
})

test('agent factory supports string parameter', async (t) => {
  t.plan(2)

  const noopHandler = {
    onConnect () {},
    onHeaders () {},
    onData () {},
    onComplete () {
      server.close()
    },
    onError (err) {
      throw err
    }
  }

  const dispatcher = new Agent({
    factory: (origin, opts) => {
      t.assert.ok(typeof origin === 'string')
      return new Pool(origin, opts)
    }
  })

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('asd')
  })

  await once(server.listen(0), 'listening')
  t.assert.doesNotThrow(() => dispatcher.dispatch({
    origin: `http://localhost:${server.address().port}`,
    path: '/',
    method: 'GET'
  }, noopHandler))
})

test('with globalAgent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    request(`http://localhost:${server.address().port}`)
      .then(({ statusCode, headers, body }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
          done()
        })
      })
      .catch(err => {
        t.assert.fail(err)
      })
  })
})

test('with local agent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  const dispatcher = new Agent({
    connect: {
      servername: 'agent1'
    }
  })

  server.listen(0, () => {
    request(`http://localhost:${server.address().port}`, { dispatcher })
      .then(({ statusCode, headers, body }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        body.on('data', (buf) => {
          bufs.push(buf)
        })
        body.on('end', () => {
          t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
          done()
        })
      })
      .catch(err => {
        t.assert.fail(err)
      })
  })
})

test('fails with invalid args', t => {
  t.assert.throws(() => request(), errors.InvalidArgumentError, 'throws on missing url argument')
  t.assert.throws(() => request(''), errors.InvalidArgumentError, 'throws on invalid url')
  t.assert.throws(() => request({}), errors.InvalidArgumentError, 'throws on missing url.origin argument')
  t.assert.throws(() => request({ origin: '' }), errors.InvalidArgumentError, 'throws on invalid url.origin argument')
  t.assert.throws(() => request('https://example.com', { path: 0 }), errors.InvalidArgumentError, 'throws on opts.path argument')
  t.assert.throws(() => request('https://example.com', { agent: new Agent() }), errors.InvalidArgumentError, 'throws on opts.path argument')
  t.assert.throws(() => request('https://example.com', 'asd'), errors.InvalidArgumentError, 'throws on non object opts argument')
})

test('with globalAgent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    stream(
      `http://localhost:${server.address().port}`,
      {
        opaque: new PassThrough()
      },
      ({ statusCode, headers, opaque: pt }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        pt.on('data', (buf) => {
          bufs.push(buf)
        })
        pt.on('end', () => {
          t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
          done()
        })
        pt.on('error', () => {
          t.assert.fail()
        })
        return pt
      }
    )
  })
})

test('with a local agent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
    done()
  })

  t.after(closeServerAsPromise(server))

  const dispatcher = new Agent()

  dispatcher.on('connect', (origin, [dispatcher]) => {
    t.assert.ok(dispatcher)
    t.assert.strictEqual(dispatcher[kRunning], 0)
    process.nextTick(() => {
      t.assert.strictEqual(dispatcher[kRunning], 1)
    })
  })

  server.listen(0, () => {
    stream(
      `http://localhost:${server.address().port}`,
      {
        dispatcher,
        opaque: new PassThrough()
      },
      ({ statusCode, headers, opaque: pt }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        const bufs = []
        pt.on('data', (buf) => {
          bufs.push(buf)
        })
        pt.on('end', () => {
          t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
        })
        pt.on('error', (err) => {
          t.assert.fail(err)
        })
        return pt
      }
    )
  })
})

test('stream: fails with invalid URL', t => {
  t.plan(4)
  t.assert.throws(() => stream(), errors.InvalidArgumentError, 'throws on missing url argument')
  t.assert.throws(() => stream(''), errors.InvalidArgumentError, 'throws on invalid url')
  t.assert.throws(() => stream({}), errors.InvalidArgumentError, 'throws on missing url.origin argument')
  t.assert.throws(() => stream({ origin: '' }), errors.InvalidArgumentError, 'throws on invalid url.origin argument')
})

test('with globalAgent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const bufs = []

    pipeline(
      `http://localhost:${server.address().port}`,
      {},
      ({ statusCode, headers, body }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        done()
        return body
      }
    )
      .end()
      .on('data', buf => {
        bufs.push(buf)
      })
      .on('end', () => {
        t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
      })
      .on('error', (err) => {
        t.assert.fail(err)
      })
  })
})

test('with a local agent', (t, done) => {
  t.plan(6)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    t.assert.strictEqual(`localhost:${server.address().port}`, req.headers.host)
    res.setHeader('Content-Type', 'text/plain')
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  const dispatcher = new Agent()

  server.listen(0, () => {
    const bufs = []

    pipeline(
      `http://localhost:${server.address().port}`,
      { dispatcher },
      ({ statusCode, headers, body }) => {
        t.assert.strictEqual(statusCode, 200)
        t.assert.strictEqual(headers['content-type'], 'text/plain')
        done()
        return body
      }
    )
      .end()
      .on('data', buf => {
        bufs.push(buf)
      })
      .on('end', () => {
        t.assert.strictEqual(wanted, Buffer.concat(bufs).toString('utf8'))
      })
      .on('error', () => {
        t.assert.fail()
      })
  })
})

test('pipeline: fails with invalid URL', t => {
  t.plan(4)
  t.assert.throws(() => pipeline(), errors.InvalidArgumentError, 'throws on missing url argument')
  t.assert.throws(() => pipeline(''), errors.InvalidArgumentError, 'throws on invalid url')
  t.assert.throws(() => pipeline({}), errors.InvalidArgumentError, 'throws on missing url.origin argument')
  t.assert.throws(() => pipeline({ origin: '' }), errors.InvalidArgumentError, 'throws on invalid url.origin argument')
})

test('pipeline: fails with invalid onInfo', (t, done) => {
  t.plan(2)
  pipeline({ origin: 'http://localhost', path: '/', onInfo: 'foo' }, () => {}).on('error', (err) => {
    t.assert.ok(err instanceof errors.InvalidArgumentError)
    t.assert.strictEqual(err.message, 'invalid onInfo callback')
    done()
  })
})

test('request: fails with invalid onInfo', async (t) => {
  try {
    await request({ origin: 'http://localhost', path: '/', onInfo: 'foo' })
    t.assert.fail('should throw')
  } catch (e) {
    t.assert.ok(e)
    t.assert.strictEqual(e.message, 'invalid onInfo callback')
  }
})

test('stream: fails with invalid onInfo', async (t) => {
  try {
    await stream({ origin: 'http://localhost', path: '/', onInfo: 'foo' }, () => new PassThrough())
    t.assert.fail('should throw')
  } catch (e) {
    t.assert.ok(e)
    t.assert.strictEqual(e.message, 'invalid onInfo callback')
  }
})

test('constructor validations', t => {
  t.plan(3)
  t.assert.throws(() => new Agent({ factory: 'ASD' }), errors.InvalidArgumentError, 'throws on invalid opts argument')
  t.assert.throws(() => new Agent({ maxOrigins: -1 }), errors.InvalidArgumentError, 'maxOrigins must be a number greater than 0')
  t.assert.throws(() => new Agent({ maxOrigins: 'foo' }), errors.InvalidArgumentError, 'maxOrigins must be a number greater than 0')
})

test('dispatch validations', async t => {
  const dispatcher = new Agent()

  const noopHandler = {
    onConnect () {},
    onHeaders () {},
    onData () {},
    onComplete () {
      server.close()
    },
    onError (err) {
      throw err
    }
  }

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('asd')
  })

  t.plan(6)
  t.assert.throws(() => dispatcher.dispatch('ASD'), errors.InvalidArgumentError, 'throws on missing handler')
  t.assert.throws(() => dispatcher.dispatch('ASD', noopHandler), errors.InvalidArgumentError, 'throws on invalid opts argument type')
  t.assert.throws(() => dispatcher.dispatch({}, noopHandler), errors.InvalidArgumentError, 'throws on invalid opts.origin argument')
  t.assert.throws(() => dispatcher.dispatch({ origin: '' }, noopHandler), errors.InvalidArgumentError, 'throws on invalid opts.origin argument')
  t.assert.throws(() => dispatcher.dispatch({}, {}), errors.InvalidArgumentError, 'throws on invalid handler.onError')

  await once(server.listen(0), 'listening')
  t.assert.doesNotThrow(() => dispatcher.dispatch({
    origin: new URL(`http://localhost:${server.address().port}`),
    path: '/',
    method: 'GET'
  }, noopHandler))
})

test('drain', (t, done) => {
  t.plan(2)

  const dispatcher = new Agent({
    connections: 1,
    pipelining: 1
  })

  dispatcher.on('drain', () => {
    t.assert.ok(1)
    done()
  })

  class Handler {
    onConnect () {}
    onHeaders () {}
    onData () {}
    onComplete () {}
    onError () {
      t.assert.fail()
    }
  }

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('asd')
  })

  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    t.assert.strictEqual(dispatcher.dispatch({
      origin: `http://localhost:${server.address().port}`,
      method: 'GET',
      path: '/'
    }, new Handler()), false)
  })
})

test('global api', async (t) => {
  t.plan(6 * 2)

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    if (req.url === '/bar') {
      t.assert.strictEqual(req.method, 'PUT')
      t.assert.strictEqual(req.url, '/bar')
    } else {
      t.assert.strictEqual(req.method, 'GET')
      t.assert.strictEqual(req.url, '/foo')
    }
    req.pipe(res)
  })

  t.after(closeServerAsPromise(server))

  await once(server.listen(0), 'listening')
  const origin = `http://localhost:${server.address().port}`
  await request(origin, { path: '/foo' })
  await request(`${origin}/foo`)
  await request({ origin, path: '/foo' })
  await stream({ origin, path: '/foo' }, () => new PassThrough())
  await request({ protocol: 'http:', hostname: 'localhost', port: server.address().port, path: '/foo' })
  await request(`${origin}/bar`, { body: 'asd' })
})

test('global api throws', t => {
  const origin = 'http://asd'
  t.assert.throws(() => request(`${origin}/foo`, { path: '/foo' }), errors.InvalidArgumentError)
  t.assert.throws(() => request({ origin, path: 0 }, { path: '/foo' }), errors.InvalidArgumentError)
  t.assert.throws(() => request({ origin, pathname: 0 }, { path: '/foo' }), errors.InvalidArgumentError)
  t.assert.throws(() => request({ origin: 0 }, { path: '/foo' }), errors.InvalidArgumentError)
  t.assert.throws(() => request(0), errors.InvalidArgumentError)
  t.assert.throws(() => request(1), errors.InvalidArgumentError)
})

test('unreachable request rejects and can be caught', (t, done) => {
  t.plan(1)

  request('https://thisis.not/avalid/url').catch(() => {
    t.assert.ok(1)
    done()
  })
})

test('connect is not valid', t => {
  t.plan(1)

  t.assert.throws(() => new Agent({ connect: false }), errors.InvalidArgumentError, 'connect must be a function or an object')
})

test('the dispatcher is truly global', t => {
  const agent = getGlobalDispatcher()
  t.assert.ok(require.resolve('../../index.js') in require.cache)
  delete require.cache[require.resolve('../../index.js')]
  t.assert.strictEqual(require.resolve('../../index.js') in require.cache, false)
  const undiciFresh = require('../../index.js')
  t.assert.ok(require.resolve('../../index.js') in require.cache)
  t.assert.strictEqual(agent, undiciFresh.getGlobalDispatcher())
})

test('stats', (t, done) => {
  t.plan(7)
  const wanted = 'payload'

  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.strictEqual('/', req.url)
    t.assert.strictEqual('GET', req.method)
    res.end(wanted)
  })

  t.after(closeServerAsPromise(server))

  const dispatcher = new Agent({
    connect: {
      servername: 'agent1'
    }
  })

  server.listen(0, () => {
    request(`http://localhost:${server.address().port}`, { dispatcher })
      .then(({ statusCode, headers, body }) => {
        t.assert.strictEqual(statusCode, 200)
        const originForStats = `http://localhost:${server.address().port}`
        const agentStats = dispatcher.stats[originForStats]
        t.assert.strictEqual(agentStats.connected, 1)
        t.assert.strictEqual(agentStats.pending, 0)
        t.assert.strictEqual(agentStats.running, 0)
        t.assert.strictEqual(agentStats.size, 0)
        done()
      })
      .catch(err => {
        t.assert.fail(err)
      })
  })
})
