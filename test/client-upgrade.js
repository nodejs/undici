'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const net = require('net')
const http = require('http')
const EE = require('events')

test('basic upgrade', (t) => {
  t.plan(6)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const signal = new EE()
    client.upgrade({
      signal,
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.error(err)

      t.strictEqual(signal.listenerCount('abort'), 0)

      const { headers, socket } = data

      let recvData = ''
      data.socket.on('data', (d) => {
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
    t.strictEqual(signal.listenerCount('abort'), 1)
  })
})

test('basic upgrade promise', (t) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('upgrade error', (t) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('upgrade invalid opts', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5432')

  client.upgrade(null, err => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.upgrade(null, null)
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('basic upgrade2', (t) => {
  t.plan(4)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.error(err)

      const { headers, socket } = data

      t.strictEqual(socket._readableState.flowing, null)

      let recvData = ''
      data.socket.on('data', (d) => {
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
})

test('upgrade wait for empty pipeline', (t) => {
  t.plan(7)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.error(err)
    })
    client.once('connect', () => {
      process.nextTick(() => {
        t.strictEqual(client.busy, false)

        client.upgrade({
          path: '/'
        }, (err, { socket }) => {
          t.error(err)
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
        t.strictEqual(client.busy, true)

        client.request({
          path: '/',
          method: 'GET'
        }, (err) => {
          t.error(err)
        })
      })
    })
  })
})

test('upgrade aborted', (t) => {
  t.plan(6)

  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('upgrade', (req, c, firstBodyChunk) => {
    t.fail()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.destroy.bind(client))

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
    t.strictEqual(client.busy, true)
    t.strictEqual(signal.listenerCount('abort'), 1)
    signal.emit('abort')

    client.close(() => {
      t.pass()
    })
  })
})

test('basic aborted after res', (t) => {
  t.plan(1)

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
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket',
      signal
    }, (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })
})

test('basic upgrade error', (t) => {
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
    c.on('error', () => {

    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const _err = new Error()
    client.upgrade({
      path: '/',
      method: 'GET',
      protocol: 'Websocket'
    }, (err, data) => {
      t.error(err)
      data.socket.on('error', (err) => {
        t.strictEqual(err, _err)
      })
      throw _err
    })
  })
})

test('upgrade invalid signal', (t) => {
  t.plan(2)

  const server = net.createServer(() => {
    t.fail()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

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
})
