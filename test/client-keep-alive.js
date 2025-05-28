'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const timers = require('../lib/util/timers')
const { kConnect } = require('../lib/core/symbols')
const { createServer } = require('node:net')
const http = require('node:http')
const FakeTimers = require('@sinonjs/fake-timers')

test('keep-alive header', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=2s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 4e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('keep-alive header 0', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install()
  after(() => clock.uninstall())

  const orgTimers = { ...timers }
  Object.assign(timers, { setTimeout, clearTimeout })
  after(() => { Object.assign(timers, orgTimers) })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeoutThreshold: 500
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      client.on('disconnect', () => {
        t.ok(true, 'pass')
      })
      clock.tick(600)
    }).resume()
  })
  await t.completed
})

test('keep-alive header 1', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 0)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('keep-alive header no postfix', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=2\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 4e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('keep-alive not timeout', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeoutasdasd=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout: 1e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 3e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('keep-alive threshold', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout: 30e3,
    keepAliveTimeoutThreshold: 29e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 5e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('keep-alive max keepalive', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout: 30e3,
    keepAliveMaxTimeout: 1e3
  })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      const timeout = setTimeout(() => {
        t.fail()
      }, 3e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
    }).resume()
  })
  await t.completed
})

test('connection close', async (t) => {
  t = tspl(t, { plan: 4 })

  let close = false
  const server = createServer((socket) => {
    if (close) {
      return
    }
    close = true
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Connection: close\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    pipelining: 2
  })
  after(() => client.close())

  client[kConnect](() => {
    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.ifError(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 3e3)
        client.once('disconnect', () => {
          close = false
          t.ok(true, 'pass')
          clearTimeout(timeout)
        })
      }).resume()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.ifError(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 3e3)
        client.once('disconnect', () => {
          t.ok(true, 'pass')
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
  await t.completed
})

test('Disable keep alive', async (t) => {
  t = tspl(t, { plan: 7 })

  const ports = []
  const server = http.createServer((req, res) => {
    t.strictEqual(ports.includes(req.socket.remotePort), false)
    ports.push(req.socket.remotePort)
    t.strictEqual(req.headers.connection, 'close')
    res.writeHead(200, { connection: 'close' })
    res.end()
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 0 })
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, { body }) => {
    t.ifError(err)
    body.on('end', () => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, { body }) => {
        t.ifError(err)
        body.on('end', () => {
          t.ok(true, 'pass')
        }).resume()
      })
    }).resume()
  })
  await t.completed
})
