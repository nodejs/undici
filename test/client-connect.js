'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const http = require('http')
const EE = require('events')
const { kBusy } = require('../lib/core/symbols')

test('basic connect', (t) => {
  t.plan(3)

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
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const signal = new EE()
    const promise = client.connect({
      signal,
      path: '/'
    })
    t.equal(signal.listenerCount('abort'), 1)
    const { socket } = await promise
    t.equal(signal.listenerCount('abort'), 0)

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('end', () => {
      t.equal(recvData.toString(), 'Body')
    })

    socket.write('Body')
    socket.end()
  })
})

test('connect >=300 should error', (t) => {
  t.plan(2)

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
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    try {
      await client.connect({
        path: '/'
      })
    } catch (err) {
      t.equal(err.code, 'UND_ERR_SOCKET')
      t.equal(err.message, 'bad connect')
    }
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
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

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
  t.plan(6)

  const client = new Client('http://localhost:5432')

  client.connect(null, err => {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid opts')
  })

  try {
    client.connect(null, null)
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid opts')
  }

  try {
    client.connect({ path: '/' }, null)
    t.fail()
  } catch (err) {
    t.type(err, errors.InvalidArgumentError)
    t.equal(err.message, 'invalid callback')
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
    t.equal(canConnect, true)
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

    let data = firstBodyChunk.toString()
    socket.on('data', (buf) => {
      data += buf.toString()
    })

    socket.on('end', () => {
      socket.end(data)
    })
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.error(err)
    })
    client.once('connect', () => {
      process.nextTick(() => {
        t.equal(client[kBusy], false)

        client.connect({
          path: '/'
        }, (err, { socket }) => {
          t.error(err)
          let recvData = ''
          socket.on('data', (d) => {
            recvData += d
          })

          socket.on('end', () => {
            t.equal(recvData.toString(), 'Body')
          })

          socket.write('Body')
          socket.end()
        })
        t.equal(client[kBusy], true)

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
  t.plan(6)

  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    t.fail()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.destroy.bind(client))

    const signal = new EE()
    client.connect({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.equal(opaque, 'asd')
      t.equal(signal.listenerCount('abort'), 0)
      t.type(err, errors.RequestAbortedError)
    })
    t.equal(client[kBusy], true)
    t.equal(signal.listenerCount('abort'), 1)
    signal.emit('abort')

    client.close(() => {
      t.pass()
    })
  })
})

test('basic connect error', (t) => {
  t.plan(2)

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
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const _err = new Error()
    client.connect({
      path: '/'
    }, (err, { socket }) => {
      t.error(err)
      socket.on('error', (err) => {
        t.equal(err, _err)
      })
      throw _err
    })
  })
})

test('connect invalid signal', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    t.fail()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.on('disconnect', () => {
      t.fail()
    })

    client.connect({
      path: '/',
      signal: 'error',
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.equal(opaque, 'asd')
      t.type(err, errors.InvalidArgumentError)
    })
  })
})

test('connect aborted after connect', (t) => {
  t.plan(3)

  const signal = new EE()
  const server = http.createServer((req, res) => {
    t.fail()
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    signal.emit('abort')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.teardown(client.destroy.bind(client))

    client.connect({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      t.equal(opaque, 'asd')
      t.type(err, errors.RequestAbortedError)
    })
    t.equal(client[kBusy], true)
  })
})
