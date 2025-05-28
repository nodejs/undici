'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client, errors } = require('..')
const net = require('node:net')
const http = require('node:http')
const EE = require('node:events')
const { kBusy } = require('../lib/core/symbols')

test('basic upgrade', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = net.createServer((c) => {
    c.on('data', (d) => {
      t.ok(/upgrade: websocket/i.test(d))
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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const signal = new EE()
    client.upgrade({
      signal,
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.ifError(err)

      t.strictEqual(signal.listenerCount('abort'), 0)

      const { headers, socket } = data

      let recvData = ''
      data.socket.on('data', (d) => {
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
    t.strictEqual(signal.listenerCount('abort'), 1)
  })

  await t.completed
})

test('basic upgrade promise', async (t) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('upgrade error', async (t) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('upgrade invalid opts', async (t) => {
  t = tspl(t, { plan: 6 })

  const client = new Client('http://localhost:5432')

  client.upgrade(null, err => {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid opts')
  })

  try {
    client.upgrade(null, null)
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid opts')
  }

  try {
    client.upgrade({ path: '/' }, null)
    t.fail()
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
    t.strictEqual(err.message, 'invalid callback')
  }
})

test('basic upgrade2', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = http.createServer()
  server.on('upgrade', (req, c, head) => {
    c.write('HTTP/1.1 101\r\n')
    c.write('hello: world\r\n')
    c.write('connection: upgrade\r\n')
    c.write('upgrade: websocket\r\n')
    c.write('\r\n')
    c.write('Body')
    c.end()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.ifError(err)

      const { headers, socket } = data

      let recvData = ''
      data.socket.on('data', (d) => {
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
  })

  await t.completed
})

test('upgrade wait for empty pipeline', async (t) => {
  t = tspl(t, { plan: 7 })

  let canConnect = false
  const server = http.createServer((req, res) => {
    res.end()
    canConnect = true
  })
  server.on('upgrade', (req, c, firstBodyChunk) => {
    t.strictEqual(canConnect, true)
    c.write('HTTP/1.1 101\r\n')
    c.write('hello: world\r\n')
    c.write('connection: upgrade\r\n')
    c.write('upgrade: websocket\r\n')
    c.write('\r\n')
    c.write('Body')
    c.end()
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET',
      blocking: false
    }, (err) => {
      t.ifError(err)
    })
    client.once('connect', () => {
      process.nextTick(() => {
        t.strictEqual(client[kBusy], false)

        client.upgrade({
          path: '/'
        }, (err, { socket }) => {
          t.ifError(err)
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
        t.strictEqual(client[kBusy], true)

        client.request({
          path: '/',
          method: 'GET'
        }, (err) => {
          t.ifError(err)
        })
      })
    })
  })

  await t.completed
})

test('upgrade aborted', async (t) => {
  t = tspl(t, { plan: 6 })

  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('upgrade', (req, c, firstBodyChunk) => {
    t.fail()
  })
  after(() => server.close())

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    after(() => client.destroy())

    const signal = new EE()
    client.upgrade({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.strictEqual(opaque, 'asd')
      t.ok(err instanceof errors.RequestAbortedError)
      t.strictEqual(signal.listenerCount('abort'), 0)
    })
    t.strictEqual(client[kBusy], true)
    t.strictEqual(signal.listenerCount('abort'), 1)
    signal.emit('abort')

    client.close(() => {
      t.ok(true, 'pass')
    })
  })

  await t.completed
})

test('basic aborted after res', async (t) => {
  t = tspl(t, { plan: 1 })

  const signal = new EE()
  const server = http.createServer()
  server.on('upgrade', (req, c, head) => {
    c.write('HTTP/1.1 101\r\n')
    c.write('hello: world\r\n')
    c.write('connection: upgrade\r\n')
    c.write('upgrade: websocket\r\n')
    c.write('\r\n')
    c.write('Body')
    c.end()
    c.on('error', () => {

    })
    signal.emit('abort')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket',
      signal
    }, (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })

  await t.completed
})

test('basic upgrade error', async (t) => {
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
    c.on('error', () => {

    })
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const _err = new Error()
    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.ifError(err)
      data.socket.on('error', (err) => {
        t.strictEqual(err, _err)
      })
      throw _err
    })
  })

  await t.completed
})

test('upgrade disconnect', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = net.createServer(connection => {
    connection.destroy()
  })

  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.on('disconnect', (origin, [self], error) => {
      t.strictEqual(client, self)
      t.ok(error instanceof Error)
    })

    client
      .upgrade({ path: '/', method: 'GET' })
      .then(() => {
        t.fail()
      })
      .catch(error => {
        t.ok(error instanceof Error)
      })
  })

  await t.completed
})

test('upgrade invalid signal', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(() => {
    t.fail()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.on('disconnect', () => {
      t.fail()
    })

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket',
      signal: 'error',
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.strictEqual(opaque, 'asd')
      t.ok(err instanceof errors.InvalidArgumentError)
    })
  })

  await t.completed
})
