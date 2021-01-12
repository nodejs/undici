'use strict'

const proxyquire = require('proxyquire')
const { test } = require('tap')
const undici = require('..')
const { Client, Pool, errors } = require('..')
const { createServer } = require('http')
const { EventEmitter } = require('events')
const { promisify } = require('util')
const { PassThrough, Readable } = require('stream')
const eos = require('stream').finished
const net = require('net')
const EE = require('events')

test('connect/disconnect event(s)', (t) => {
  const clients = 2

  t.plan(clients * 3)

  const server = createServer((req, res) => {
    res.writeHead(200, {
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=1s'
    })
    res.end('ok')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const pool = new Pool(`http://localhost:${server.address().port}`, {
      connections: clients,
      keepAliveTimeoutThreshold: 100
    })
    t.tearDown(pool.close.bind(pool))

    pool.on('connect', (client) => {
      t.strictEqual(client instanceof Client, true)
    })
    pool.on('disconnect', (client) => {
      t.strictEqual(client instanceof Client, true)
    })

    for (let i = 0; i < clients; i++) {
      pool.request({
        path: '/',
        method: 'GET'
      }, (err, { headers, body }) => {
        t.error(err)
        body.resume()
      })
    }
  })
})

test('basic get', (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
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
      t.error(err)
      client.destroy((err) => {
        t.error(err)
        client.close((err) => {
          t.ok(err instanceof errors.ClientDestroyedError)
        })
      })
    })
  })
})
test('URL as arg', (t) => {
  t.plan(9)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const url = new URL('http://localhost')
    url.port = server.address().port
    const client = undici(url)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
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
      t.error(err)
      client.destroy((err) => {
        t.error(err)
        client.close((err) => {
          t.ok(err instanceof errors.ClientDestroyedError)
        })
      })
    })
  })
})
test('basic get error async/await', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    await client.request({ path: '/', method: 'GET' })
      .catch((err) => {
        t.ok(err)
      })

    await client.destroy()

    await client.close().catch((err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
})

test('basic get with async/await', async (t) => {
  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Pool(`http://localhost:${server.address().port}`)
  t.tearDown(client.destroy.bind(client))

  const { statusCode, headers, body } = await client.request({ path: '/', method: 'GET' })
  t.strictEqual(statusCode, 200)
  t.strictEqual(headers['content-type'], 'text/plain')

  body.resume()
  await promisify(eos)(body)

  await client.close()
  await client.destroy()
})

test('stream get async/await', async (t) => {
  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  await promisify(server.listen.bind(server))(0)
  const client = new Pool(`http://localhost:${server.address().port}`)
  t.tearDown(client.destroy.bind(client))

  await client.stream({ path: '/', method: 'GET' }, ({ statusCode, headers }) => {
    t.strictEqual(statusCode, 200)
    t.strictEqual(headers['content-type'], 'text/plain')
    return new PassThrough()
  })
})

test('stream get error async/await', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    await client.stream({ path: '/', method: 'GET' }, () => {

    })
      .catch((err) => {
        t.ok(err)
      })
  })
})

test('pipeline get', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = undici(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
})

test('backpressure algorithm', (t) => {
  const seen = []
  let total = 0

  class FakeClient extends EventEmitter {
    constructor () {
      super()

      this.id = total++
      this._busy = false
    }

    get busy () {
      return this._busy
    }

    get connected () {
      return true
    }

    dispatch (req, cb) {
      seen.push({ req, cb, client: this, id: this.id })
    }
  }

  const Pool = proxyquire('../lib/pool', {
    './core/client': FakeClient
  })

  const pool = new Pool('http://notanhost')

  pool.dispatch({}, noop)
  pool.dispatch({}, noop)

  const d1 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)
  const d2 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)

  t.strictEqual(d1.id, d2.id)

  pool.dispatch({}, noop) // d3 = c0

  d1.client._busy = true

  pool.dispatch({}, noop) // d4 = c1

  const d3 = seen.shift()
  t.strictEqual(d3.id, 0)
  const d4 = seen.shift()
  t.strictEqual(d4.id, 1)

  t.strictEqual(d3.id, d2.id)
  t.notStrictEqual(d3.id, d4.id)

  pool.dispatch({}, noop) // d5 = c1

  d1.client._busy = false

  pool.dispatch({}, noop) // d6 = c0

  const d5 = seen.shift()
  t.strictEqual(d5.id, 1)
  const d6 = seen.shift()
  t.strictEqual(d6.id, 0)

  t.strictEqual(d5.id, d4.id)
  t.strictEqual(d3.id, d6.id)

  t.strictEqual(total, 2)

  t.end()
})

function noop () {}

test('busy', (t) => {
  t.plan(8 * 6)

  const server = createServer((req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = undici(`http://localhost:${server.address().port}`, {
      connections: 2,
      pipelining: 2
    })
    t.tearDown(client.destroy.bind(client))

    for (let n = 0; n < 8; ++n) {
      client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
        t.error(err)
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
    }
  })
})

test('invalid options throws', (t) => {
  t.plan(4)

  try {
    new Pool(null, { connections: -1 }) // eslint-disable-line
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid connections')
  }

  try {
    new Pool(null, { connections: true }) // eslint-disable-line
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid connections')
  }
})

test('pool upgrade promise', (t) => {
  t.plan(2)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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

    t.deepEqual(headers, {
      hello: 'world',
      connection: 'upgrade',
      upgrade: 'websocket'
    })
    socket.end()
  })
})

test('pool connect', (t) => {
  t.plan(1)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
})

test('pool dispatch', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
})

test('pool pipeline args validation', (t) => {
  t.plan(2)

  const client = new Pool('http://localhost:5000')

  const ret = client.pipeline(null, () => {})
  ret.on('error', (err) => {
    t.ok(/opts/.test(err.message))
    t.ok(err instanceof errors.InvalidArgumentError)
  })
})

test('300 requests succeed', (t) => {
  t.plan(300 * 3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1
    })
    t.tearDown(client.destroy.bind(client))

    for (let n = 0; n < 300; ++n) {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, data) => {
        t.error(err)
        data.body.on('data', (chunk) => {
          t.strictEqual(chunk.toString(), 'asd')
        }).on('end', () => {
          t.pass()
        })
      })
    }
  })
})

test('pool connect error', (t) => {
  t.plan(1)

  const server = createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    try {
      await client.connect({
        path: '/'
      })
    } catch (err) {
      t.ok(err)
    }
  })
})

test('pool upgrade error', (t) => {
  t.plan(1)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

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
})

test('pool dispatch error', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
        t.pass()
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
})

test('pool request abort in queue', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
        t.pass()
      },
      onError () {
      }
    })

    const signal = new EE()
    client.request({
      path: '/',
      method: 'GET',
      signal
    }, (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })
})

test('pool stream abort in queue', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
        t.pass()
      },
      onError () {
      }
    })

    const signal = new EE()
    client.stream({
      path: '/',
      method: 'GET',
      signal
    }, ({ body }) => body, (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })
})

test('pool pipeline abort in queue', (t) => {
  t.plan(3)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
        t.pass()
      },
      onError () {
      }
    })

    const signal = new EE()
    client.pipeline({
      path: '/',
      method: 'GET',
      signal
    }, ({ body }) => body).end().on('error', (err) => {
      t.strictEqual(err.code, 'UND_ERR_ABORTED')
    })
    signal.emit('abort')
  })
})

test('pool stream constructor error destroy body', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
})

test('pool request constructor error destroy body', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.close.bind(client))

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
})

test('pool close waits for all requests', (t) => {
  t.plan(5)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.error(err)
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.error(err)
    })

    client.close(() => {
      t.pass()
    })

    client.close(() => {
      t.pass()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientClosedError)
    })
  })
})

test('pool destroyed', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

    client.destroy()
    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
})

test('pool destroy fails queued requests', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Pool(`http://localhost:${server.address().port}`, {
      connections: 1,
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

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

    client.destroy(_err, () => {
      t.pass()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.ClientDestroyedError)
    })
  })
})
