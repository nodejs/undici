'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const http = require('http')
const EE = require('events')

test('basic connect', (t) => {
  t.plan(1)

  const server = http.createServer((c) => {
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
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('connect >=300 should not error', (t) => {
  t.plan(1)

  const server = http.createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.write('HTTP/1.1 300 Connection established\r\n\r\n')

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
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    const { statusCode, socket } = await client.connect({
      path: '/'
    })
    t.strictEqual(statusCode, 300)
    socket.destroy()
  })
})

test('connect error', (t) => {
  t.plan(1)

  const server = http.createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.destroy()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
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

test('connect invalid opts', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5432')

  client.connect(null, err => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.connect(null, null)
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})

test('connect wait for empty pipeline', (t) => {
  t.plan(7)

  let canConnect = false
  const server = http.createServer((req, res) => {
    res.end()
    canConnect = true
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    t.strictEqual(canConnect, true)
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

        client.connect({
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

test('connect aborted', (t) => {
  t.plan(3)

  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    t.fail()
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.tearDown(client.close.bind(client))

    const signal = new EE()
    client.connect({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.strictEqual(opaque, 'asd')
      t.ok(err instanceof errors.RequestAbortedError)
    })
    t.strictEqual(client.busy, true)
    signal.emit('abort')
  })
})
