'use strict'

const { test } = require('node:test')
const { Client, errors } = require('../..')
const http = require('node:http')
const EE = require('node:events')
const { kBusy } = require('../../lib/core/symbols')
const { tspl } = require('@matteo.collina/tspl')
const { closeServerAsPromise } = require('../utils/node-http')

test('basic connect', async (t) => {
  const p = tspl(t, { plan: 3 })

  const server = http.createServer((c) => {
    p.ok(0)
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
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const signal = new EE()
    const promise = client.connect({
      signal,
      path: '/'
    })
    p.strictEqual(signal.listenerCount('abort'), 1)
    const { socket } = await promise
    p.strictEqual(signal.listenerCount('abort'), 0)

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('end', () => {
      p.strictEqual(recvData.toString(), 'Body')
    })

    socket.write('Body')
    socket.end()
  })

  await p.completed
})

test('connect error', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = http.createServer((c) => {
    p.ok(0)
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.destroy()
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    try {
      await client.connect({
        path: '/'
      })
    } catch (err) {
      p.ok(err)
    }
  })

  await p.completed
})

test('connect invalid opts', (t) => {
  const p = tspl(t, { plan: 6 })

  const client = new Client('http://localhost:5432')

  client.connect(null, err => {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'invalid opts')
  })

  try {
    client.connect(null, null)
    p.ok(0)
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'invalid opts')
  }

  try {
    client.connect({ path: '/' }, null)
    p.ok(0)
  } catch (err) {
    p.ok(err instanceof errors.InvalidArgumentError)
    p.strictEqual(err.message, 'invalid callback')
  }
})

test('connect wait for empty pipeline', async (t) => {
  const p = tspl(t, { plan: 7 })

  let canConnect = false
  const server = http.createServer((req, res) => {
    res.end()
    canConnect = true
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    p.strictEqual(canConnect, true)
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

    let data = firstBodyChunk.toString()
    socket.on('data', (buf) => {
      data += buf.toString()
    })

    socket.on('end', () => {
      socket.end(data)
    })
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.after(() => { return client.close() })

    client.request({
      path: '/',
      method: 'GET',
      blocking: false
    }, (err) => {
      p.ifError(err)
    })
    client.once('connect', () => {
      process.nextTick(() => {
        p.strictEqual(client[kBusy], false)

        client.connect({
          path: '/'
        }, (err, { socket }) => {
          p.ifError(err)
          let recvData = ''
          socket.on('data', (d) => {
            recvData += d
          })

          socket.on('end', () => {
            p.strictEqual(recvData.toString(), 'Body')
          })

          socket.write('Body')
          socket.end()
        })
        p.strictEqual(client[kBusy], true)

        client.request({
          path: '/',
          method: 'GET'
        }, (err) => {
          p.ifError(err)
        })
      })
    })
  })
  await p.completed
})

test('connect aborted', async (t) => {
  const p = tspl(t, { plan: 6 })

  const server = http.createServer((req, res) => {
    p.ok(0)
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    p.ok(0)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 3
    })
    t.after(() => {
      client.destroy()
    })

    const signal = new EE()
    client.connect({
      path: '/',
      signal,
      opaque: 'asd'
    }, (err, { opaque }) => {
      p.strictEqual(opaque, 'asd')
      p.strictEqual(signal.listenerCount('abort'), 0)
      p.ok(err instanceof errors.RequestAbortedError)
    })
    p.strictEqual(client[kBusy], true)
    p.strictEqual(signal.listenerCount('abort'), 1)
    signal.emit('abort')

    client.close(() => {
      p.ok(1)
    })
  })

  await p.completed
})

test('basic connect error', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((c) => {
    p.ok(0)
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
  t.after(closeServerAsPromise(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(() => { return client.close() })

    const _err = new Error()
    client.connect({
      path: '/'
    }, (err, { socket }) => {
      p.ifError(err)
      socket.on('error', (err) => {
        p.strictEqual(err, _err)
      })
      throw _err
    })
  })

  await p.completed
})

test('connect invalid signal', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = http.createServer((req, res) => {
    p.ok(0)
  })
  server.on('connect', (req, c, firstBodyChunk) => {
    p.ok(0)
  })
  t.after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.after(client.destroy.bind(client))

    client.on('disconnect', () => {
      p.ok(0)
    })

    client.connect({
      path: '/',
      signal: 'error',
      opaque: 'asd'
    }, (err, { opaque }) => {
      p.strictEqual(opaque, 'asd')
      p.ok(err instanceof errors.InvalidArgumentError)
    })
  })

  await p.completed
})
