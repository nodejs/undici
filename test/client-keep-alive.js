'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { kConnect } = require('../lib/core/symbols')
const { createServer } = require('net')
const http = require('http')
const FakeTimers = require('@sinonjs/fake-timers')

test('keep-alive header', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=2s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 2e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('keep-alive header 0', (t) => {
  t.plan(2)

  const clock = FakeTimers.install()
  t.teardown(clock.uninstall.bind(clock))

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeoutThreshold: 500
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        client.on('disconnect', () => {
          t.pass()
        })
        clock.tick(600)
      }).resume()
    })
  })
})

test('keep-alive header 1', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 0)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('keep-alive header no postfix', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=2\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 2e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('keep-alive not timeout', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeoutasdasd=1s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 1e3
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 2e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('keep-alive threshold', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 30e3,
      keepAliveTimeoutThreshold: 29e3
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 2e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('keep-alive max keepalive', (t) => {
  t.plan(2)

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 0\r\n')
    socket.write('Keep-Alive: timeout=30s\r\n')
    socket.write('Connection: keep-alive\r\n')
    socket.write('\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 30e3,
      keepAliveMaxTimeout: 1e3
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        const timeout = setTimeout(() => {
          t.fail()
        }, 2e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
      }).resume()
    })
  })
})

test('connection close', (t) => {
  t.plan(4)

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
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 2
    })
    t.teardown(client.destroy.bind(client))

    client[kConnect](() => {
      client.request({
        path: '/',
        method: 'GET'
      }, (err, { body }) => {
        t.error(err)
        body.on('end', () => {
          const timeout = setTimeout(() => {
            t.fail()
          }, 3e3)
          client.once('disconnect', () => {
            close = false
            t.pass()
            clearTimeout(timeout)
          })
        }).resume()
      })

      client.request({
        path: '/',
        method: 'GET'
      }, (err, { body }) => {
        t.error(err)
        body.on('end', () => {
          const timeout = setTimeout(() => {
            t.fail()
          }, 3e3)
          client.once('disconnect', () => {
            t.pass()
            clearTimeout(timeout)
          })
        }).resume()
      })
    })
  })
})

test('Disable keep alive', (t) => {
  t.plan(7)

  const ports = []
  const server = http.createServer((req, res) => {
    t.false(ports.includes(req.socket.remotePort))
    ports.push(req.socket.remotePort)
    t.match(req.headers, { connection: 'close' })
    res.writeHead(200, { connection: 'close' })
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 0 })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, { body }) => {
      t.error(err)
      body.on('end', () => {
        client.request({
          path: '/',
          method: 'GET'
        }, (err, { body }) => {
          t.error(err)
          body.on('end', () => {
            t.pass()
          }).resume()
        })
      }).resume()
    })
  })
})
