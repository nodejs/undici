'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { EventEmitter } = require('node:events')
const { createServer } = require('node:http')
const net = require('node:net')
const {
  finished,
  PassThrough,
  Readable
} = require('node:stream')
const { promisify } = require('node:util')
const {
  kBusy,
  kPending,
  kRunning,
  kSize,
  kUrl
} = require('../lib/core/symbols')
const {
  Client,
  Pool,
  errors
} = require('..')

test('throws when connection is infinite', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new Pool(null, { connections: 0 / 0 }) // eslint-disable-line
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'invalid connections')
  }
})

test('throws when connections is negative', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new Pool(null, { connections: -1 }) // eslint-disable-line no-new
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'invalid connections')
  }
})

test('throws when connection is not number', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new Pool(null, { connections: true }) // eslint-disable-line no-new
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'invalid connections')
  }
})

test('throws when factory is not a function', async (t) => {
  t = tspl(t, { plan: 2 })

  try {
    new Pool(null, { factory: '' }) // eslint-disable-line no-new
  } catch (e) {
    t.ok(e instanceof errors.InvalidArgumentError)
    t.strictEqual(e.message, 'factory must be a function.')
  }
})

test('does not throw when connect is a function', async (t) => {
  t = tspl(t, { plan: 1 })

  t.doesNotThrow(() => new Pool('http://localhost', { connect: () => {} }))
})

test('connect/disconnect event(s)', async (t) => {
  const clients = 2

  t = tspl(t, { plan: clients * 6 })

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=1s'
    })
    res.end('ok')
  })
  after(() => server.close())

  server.listen(0, () => {
    const pool = new Pool(`http://localhost:${server.address().port}`, {
      connections: clients,
      keepAliveTimeoutThreshold: 100
    })
    after(() => pool.close())

    pool.on('connect', (origin, [pool, client]) => {
      t.strictEqual(client instanceof Client, true)
    })
    pool.on('disconnect', (origin, [pool, client], error) => {
      t.ok(client instanceof Client)
      t.ok(error instanceof errors.InformationalError)
      t.strictEqual(error.code, 'UND_ERR_INFO')
      t.strictEqual(error.message, 'socket idle timeout')
    })

    for (let i = 0; i < clients; i++) {
      pool.request({
        path: '/',
        method: 'GET'
      }, (err, { headers, body }) => {
        t.ifError(err)
        body.resume()
      })
    }
  })

  await t.completed
})

test('basic get', async (t) => {
  t = tspl(t, { plan: 14 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    t.strictEqual(client[kUrl].origin, `http://localhost:${server.address().port}`)

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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

    t.strictEqual(client.destroyed, false)
    t.strictEqual(client.closed, false)
    client.close((err) => {
      t.ifError(err)
      t.strictEqual(client.destroyed, true)
      client.destroy((err) => {
        t.ifError(err)
        client.close((err) => {
          t.ok(err instanceof errors.ClientDestroyedError)
        })
      })
    })
    t.strictEqual(client.closed, true)
  })

  await t.completed
})

test('URL as arg', async (t) => {
  t = tspl(t, { plan: 9 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const url = new URL('http://localhost')
    url.port = server.address().port
    const client = new Pool(url)
    after(() => client.destroy())

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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

    client.close((err) => {
      t.ifError(err)
      client.destroy((err) => {
        t.ifError(err)
        client.close((err) => {
          t.ok(err instanceof errors.ClientDestroyedError)
        })
      })
    })
  })

  await t.completed
})

test('basic get error async/await', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.destroy()
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    await client.request({ path: '/', method: 'GET' })
      .catch((err) => {
        t.ok(err)
      })

    await client.destroy()

    await client.close().catch((err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })

  await t.completed
})

test('basic get with async/await', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)
  const client = new Pool(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  body.resume()
  await promisify(finished)(body)

  await client.close()
  await client.destroy()
})

test('stream get async/await', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  await promisify(server.listen.bind(server))(0)
  const client = new Pool(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  await client.stream({ path: '/', method: 'GET' }, ({ statusCode, headers }) => {
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')
    return new PassThrough()
  })

  await t.completed
})

test('stream get error async/await', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.destroy()
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    await client.stream({ path: '/', method: 'GET' }, () => {

    })
      .catch((err) => {
        t.ok(err)
      })
  })

  await t.completed
})

test('pipeline get', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

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
  })

  await t.completed
})

test('backpressure algorithm', async (t) => {
  t = tspl(t, { plan: 12 })

  const seen = []
  let total = 0

  let writeMore = true

  class FakeClient extends EventEmitter {
    constructor () {
      super()

      this.id = total++
    }

    dispatch (req, handler) {
      seen.push({ req, client: this, id: this.id })
      return writeMore
    }
  }

  const noopHandler = {
    onError (err) {
      throw err
    }
  }

  const pool = new Pool('http://notahost', {
    factory: () => new FakeClient()
  })

  pool.dispatch({}, noopHandler)
  pool.dispatch({}, noopHandler)

  const d1 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)
  const d2 = seen.shift() // d2 = c0
  t.strictEqual(d2.id, 0)

  t.strictEqual(d1.id, d2.id)

  writeMore = false

  pool.dispatch({}, noopHandler) // d3 = c0

  pool.dispatch({}, noopHandler) // d4 = c1

  const d3 = seen.shift()
  t.strictEqual(d3.id, 0)
  const d4 = seen.shift()
  t.strictEqual(d4.id, 1)

  t.strictEqual(d3.id, d2.id)
  t.notEqual(d3.id, d4.id)

  writeMore = true

  d4.client.emit('drain', new URL('http://notahost'), [])

  pool.dispatch({}, noopHandler) // d5 = c1

  d3.client.emit('drain', new URL('http://notahost'), [])

  pool.dispatch({}, noopHandler) // d6 = c0

  const d5 = seen.shift()
  t.strictEqual(d5.id, 1)
  const d6 = seen.shift()
  t.strictEqual(d6.id, 0)

  t.strictEqual(d5.id, d4.id)
  t.strictEqual(d3.id, d6.id)

  t.strictEqual(total, 3)

  t.end()
})

test('busy', async (t) => {
  t = tspl(t, { plan: 8 * 16 + 2 + 1 })

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  after(() => server.close())

  const connections = 2

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections,
      pipelining: 2
    })
    client.on('drain', () => {
      t.ok(true, 'pass')
    })
    client.on('connect', () => {
      t.ok(true, 'pass')
    })
    after(() => client.destroy())

    for (let n = 1; n <= 8; ++n) {
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
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
      t.strictEqual(client[kPending], n)
      t.strictEqual(client[kBusy], n > 1)
      t.strictEqual(client[kSize], n)
      t.strictEqual(client[kRunning], 0)

      t.strictEqual(client.stats.connected, 0)
      t.strictEqual(client.stats.free, 0)
      t.strictEqual(client.stats.queued, Math.max(n - connections, 0))
      t.strictEqual(client.stats.pending, n)
      t.strictEqual(client.stats.size, n)
      t.strictEqual(client.stats.running, 0)
    }
  })

  await t.completed
})

test('invalid pool dispatch options', async (t) => {
  t = tspl(t, { plan: 2 })
  const pool = new Pool('http://notahost')
  t.throws(() => pool.dispatch({}), errors.InvalidArgumentError, 'throws on invalid handler')
  t.throws(() => pool.dispatch({}, {}), errors.InvalidArgumentError, 'throws on invalid handler')
})

test('pool upgrade promise', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      c.write('HTTP/1.1 101\r\n')
      c.write('hello: world\r\n')
      c.write('connection: upgrade\r\n')
      c.write('upgrade: websocket\r\n')
      c.write('\r\n')
      c.write('Body')
    })

    c.on('end', () => {
      c.end()
    })
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const { headers, socket } = await client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    })

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('close', () => {
      t.strictEqual(recvData.toString(), 'Body')
    })

    t.deepStrictEqual(headers, {
      hello: 'world',
      connection: 'upgrade',
      upgrade: 'websocket'
    })
    socket.end()
  })

  await t.completed
})

test('pool connect', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

    let data = firstBodyChunk.toString()
    socket.on('data', (buf) => {
      data += buf.toString()
    })

    socket.on('end', () => {
      socket.end(data)
    })
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const { socket } = await client.connect({
      path: '/'
    })

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('end', () => {
      t.strictEqual(recvData.toString(), 'Body')
    })

    socket.write('Body')
    socket.end()
  })

  await t.completed
})

test('pool dispatch', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    let buf = ''
    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
        buf += chunk
      },
      onComplete () {
        t.strictEqual(buf, 'asd')
      },
      onError () {
      }
    })
  })

  await t.completed
})

test('pool pipeline args validation', async (t) => {
  t = tspl(t, { plan: 2 })

  const client = new Pool('http://localhost:5000')

  const ret = client.pipeline(null, () => {})
  ret.on('error', (err) => {
    t.ok(/opts/.test(err.message))
    t.ok(err instanceof errors.InvalidArgumentError)
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
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1
    })
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

test('pool connect error', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.destroy()
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.connect({
        path: '/'
      })
    } catch (err) {
      t.ok(err)
    }
  })

  await t.completed
})

test('pool upgrade error', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      c.write('HTTP/1.1 101\r\n')
      c.write('hello: world\r\n')
      c.write('connection: upgrade\r\n')
      c.write('\r\n')
      c.write('Body')
    })
    c.on('error', () => {
      // Whether we get an error, end or close is undefined.
      // Ignore error.
    })
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    after(() => client.close())

    try {
      await client.upgrade({
        path: '/',
        method: 'GET',
        protocol: 'Websocket'
      })
    } catch (err) {
      t.ok(err)
    }
  })

  await t.completed
})

test('pool dispatch error', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
      },
      onComplete () {
        t.ok(true, 'pass')
      },
      onError () {
      }
    })

    client.dispatch({
      path: '/',
      method: 'GET',
      headers: {
        'transfer-encoding': 'fail'
      }
    }, {
      onConnect () {
        t.fail()
      },
      onHeaders (statusCode, headers) {
        t.fail()
      },
      onData (chunk) {
        t.fail()
      },
      onError (err) {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
      }
    })
  })

  await t.completed
})

test('pool request abort in queue', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
      },
      onComplete () {
        t.ok(true, 'pass')
      },
      onError () {
      }
    })

    const signal = new EventEmitter()
    client.request({
      path: '/',
      method: 'GET',
      signal
    }, (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })

  await t.completed
})

test('pool stream abort in queue', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
      },
      onComplete () {
        t.ok(true, 'pass')
      },
      onError () {
      }
    })

    const signal = new EventEmitter()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, ({ body }) => body, (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })

  await t.completed
})

test('pool pipeline abort in queue', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
      },
      onComplete () {
        t.ok(true, 'pass')
      },
      onError () {
      }
    })

    const signal = new EventEmitter()
    client.pipeline({
      path: '/',
      method: 'GET',
      signal
    }, ({ body }) => body).end().on('error', (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })

  await t.completed
})

test('pool stream constructor error destroy body', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    {
      const body = new Readable({
        read () {
        }
      })
      client.stream({
        path: '/',
        method: 'GET',
        body,
        headers: {
          'transfer-encoding': 'fail'
        }
      }, () => {
        t.fail()
      }, (err) => {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(body.destroyed, true)
      })
    }

    {
      const body = new Readable({
        read () {
        }
      })
      client.stream({
        path: '/',
        method: 'CONNECT',
        body
      }, () => {
        t.fail()
      }, (err) => {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(body.destroyed, true)
      })
    }
  })

  await t.completed
})

test('pool request constructor error destroy body', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.close())

    {
      const body = new Readable({
        read () {
        }
      })
      client.request({
        path: '/',
        method: 'GET',
        body,
        headers: {
          'transfer-encoding': 'fail'
        }
      }, (err) => {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(body.destroyed, true)
      })
    }

    {
      const body = new Readable({
        read () {
        }
      })
      client.request({
        path: '/',
        method: 'CONNECT',
        body
      }, (err) => {
        t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
        t.strictEqual(body.destroyed, true)
      })
    }
  })

  await t.completed
})

test('pool close waits for all requests', async (t) => {
  t = tspl(t, { plan: 5 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.destroy())

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ifError(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ifError(err)
    })

    client.close(() => {
      t.ok(true, 'pass')
    })

    client.close(() => {
      t.ok(true, 'pass')
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientClosedError)
    })
  })

  await t.completed
})

test('pool destroyed', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.destroy())

    client.destroy()
    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })

  await t.completed
})

test('pool destroy fails queued requests', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = createServer((req, res) => {
    res.end('asd')
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    after(() => client.destroy())

    const _err = new Error()
    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.strictEqual(err, _err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.strictEqual(err, _err)
    })

    t.strictEqual(client.destroyed, false)
    client.destroy(_err, () => {
      t.ok(true, 'pass')
    })
    t.strictEqual(client.destroyed, true)

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
  await t.completed
})
