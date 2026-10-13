'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const assert = require('node:assert/strict')
const { setImmediate: waitImmediate } = require('node:timers/promises')
const { Client } = require('..')
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
  await once(server.listen(0), 'listening')

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

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

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
  await once(server.listen(0), 'listening')

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

test('HEAD keep-alive header reuses socket when connection header is fragmented', async (t) => {
  t = tspl(t, { plan: 4 })

  let connections = 0
  let requests = 0

  const server = createServer((socket) => {
    connections++

    let request = ''
    socket.on('data', (chunk) => {
      request += chunk.toString()

      while (request.includes('\r\n\r\n')) {
        const endOfHeaders = request.indexOf('\r\n\r\n') + 4
        request = request.slice(endOfHeaders)
        requests++

        socket.write('HTTP/1.1 200 OK\r\n')
        socket.write('Content-Length: 0\r\n')
        socket.write('Connection: keep-')
        socket.write('alive\r\n')
        socket.write('\r\n')

        if (requests === 2) {
          socket.end()
        }
      }
    })
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.destroy())

  const disconnect = once(client, 'disconnect')

  const first = await client.request({
    path: '/',
    method: 'HEAD',
    reset: false
  })
  t.strictEqual(first.statusCode, 200)
  await first.body.text()

  const second = await client.request({
    path: '/',
    method: 'HEAD',
    reset: false
  })
  t.strictEqual(second.statusCode, 200)
  await second.body.text()

  await disconnect
  t.strictEqual(connections, 1)
  t.strictEqual(requests, 2)

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
  await once(server.listen(0), 'listening')

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

  const clock = FakeTimers.install({
    apis: ['setTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeoutasdasd=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())

  await once(server.listen(0), 'listening')

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
      const timeout = setTimeout(t.fail, 3e3)
      client.on('disconnect', () => {
        t.ok(true, 'pass')
        clearTimeout(timeout)
      })
      clock.tick(1000)
    }).resume()
  })

  await t.completed
})

test('keep-alive threshold', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    apis: ['setTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

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
      clock.tick(1000)
    }).resume()
  })
  await t.completed
})

test('keep-alive max keepalive', async (t) => {
  t = tspl(t, { plan: 2 })

  const clock = FakeTimers.install({
    apis: ['setTimeout']
  })
  after(() => clock.uninstall())

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

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
      clock.tick(1000)
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
  await once(server.listen(0), 'listening')

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
  const server = http.createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.strictEqual(ports.includes(req.socket.remotePort), false)
    ports.push(req.socket.remotePort)
    t.strictEqual(req.headers.connection, 'close')
    res.writeHead(200, { connection: 'close' })
    res.end()
  })
  after(() => server.close())
  await once(server.listen(0), 'listening')

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

test('HEAD connection tokens preserve reuse and respect close', { timeout: 10000 }, async (t) => {
  const useMilo = ['1', 'true'].includes(process.env.UNDICI_USE_MILO)
  for (const [name, fields, expectedConnections] of [
    ['repeated fragmented keep-alive', ['x-token', 'keep-alive'], 1],
    ['keep-alive before another field', ['keep-alive', 'x-token'], 1],
    ['comma-separated tokens and whitespace', ['x-token, \tKEEP-ALIVE\t '], 1],
    ['close before keep-alive', ['close', 'keep-alive'], 2],
    ['close after keep-alive', ['keep-alive', 'close'], 2],
    ['close in a comma-separated list', ['keep-alive, CLOSE'], 2],
    ['a longer token does not match', ['x-keep-alive'], 2]
  ]) {
    await t.test(name, async (t) => {
      let connections = 0
      const server = createServer(socket => {
        connections++
        let pending = ''
        let responses = Promise.resolve()
        socket.on('data', chunk => {
          pending += chunk.toString()
          while (pending.includes('\r\n\r\n')) {
            pending = pending.slice(pending.indexOf('\r\n\r\n') + 4)
            responses = responses.then(async () => {
              const response = 'HTTP/1.1 200 OK\r\n' +
                (useMilo ? 'Content-Length: 0\r\n' : '') +
                fields.map(value => `Connection: ${value}\r\n`).join('') + '\r\n'
              if (useMilo) {
                socket.write(response)
                return
              }
              // Split the final field value so token parsing also covers fragments.
              const split = response.length - 7
              socket.write(response.slice(0, split))
              await waitImmediate()
              socket.write(response.slice(split))
            })
          }
        })
      })
      t.after(() => server.close())
      server.listen(0)
      await once(server, 'listening')
      const client = new Client(`http://localhost:${server.address().port}`, { useMilo })
      t.after(() => client.destroy())
      for (let i = 0; i < 2; i++) {
        const response = await client.request({ path: '/', method: 'HEAD', reset: false })
        await response.body.dump()
      }
      // A framed HTTP/1.1 response stays persistent without any keep-alive token.
      const expected = ['1', 'true'].includes(process.env.UNDICI_USE_MILO) &&
        name === 'a longer token does not match'
        ? 1
        : expectedConnections
      assert.equal(connections, expected)
    })
  }
})
