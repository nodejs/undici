'use strict'

const proxyquire = require('proxyquire')
const { test } = require('tap')
const undici = require('..')
const { Pool, errors } = require('..')
const { createServer } = require('http')
const { EventEmitter } = require('events')
const { promisify } = require('util')
const { PassThrough } = require('stream')
const eos = require('stream').finished
const net = require('net')

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

    request (req, cb) {
      seen.push({ req, cb, client: this, id: this.id })
    }
  }

  const Pool = proxyquire('../lib/pool', {
    './client': FakeClient
  })

  const pool = new Pool('http://notanhost')

  t.strictEqual(total, 10)

  pool.request({}, noop)
  pool.request({}, noop)

  const d1 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)
  const d2 = seen.shift() // d1 = c0
  t.strictEqual(d1.id, 0)

  t.strictEqual(d1.id, d2.id)

  pool.request({}, noop) // d3 = c0

  d1.client._busy = true

  pool.request({}, noop) // d4 = c1

  const d3 = seen.shift()
  t.strictEqual(d3.id, 0)
  const d4 = seen.shift()
  t.strictEqual(d4.id, 1)

  t.strictEqual(d3.id, d2.id)
  t.notStrictEqual(d3.id, d4.id)

  pool.request({}, noop) // d5 = c1

  d1.client._busy = false

  pool.request({}, noop) // d6 = c0

  const d5 = seen.shift()
  t.strictEqual(d5.id, 1)
  const d6 = seen.shift()
  t.strictEqual(d6.id, 0)

  t.strictEqual(d5.id, d4.id)
  t.strictEqual(d3.id, d6.id)

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
  t.plan(6)

  try {
    new Pool(null, { connections: 0 }) // eslint-disable-line
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid connections')
  }

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
      onHeaders (statusCode, headers) {
        t.strictEqual(statusCode, 200)
      },
      onData (chunk) {
        buf += chunk
      },
      onComplete () {
        t.strictEqual(buf, 'asd')
      }
    })
  })
})
