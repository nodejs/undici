'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('net')

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
        }, 3e3)
        client.on('disconnect', () => {
          t.pass()
          clearTimeout(timeout)
        })
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
      idleTimeout: 1e3
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
      idleTimeout: 30e3,
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
      idleTimeout: 30e3,
      maxKeepAliveTimeout: 1e3
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
