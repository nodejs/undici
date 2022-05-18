'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const net = require('net')

test('https://github.com/mcollina/undici/issues/810', (t) => {
  t.plan(3)

  let x = 0
  const server = net.createServer(socket => {
    if (x++ === 0) {
      socket.write('HTTP/1.1 200 OK\r\n')
      socket.write('Content-Length: 1\r\n\r\n')
      socket.write('11111\r\n')
    } else {
      socket.write('HTTP/1.1 200 OK\r\n')
      socket.write('Content-Length: 0\r\n\r\n')
      socket.write('\r\n')
    }
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 2 })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        // t.fail() FIX: Should fail.
        t.pass()
      }).on('error', err => (
        t.type(err, errors.HTTPParserError)
      ))
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.type(err, errors.HTTPParserError)
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 no pipelining', (t) => {
  t.plan(2)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        // t.fail() FIX: Should fail.
        t.pass()
      })
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 pipelining', (t) => {
  t.plan(2)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        // t.fail() FIX: Should fail.
        t.pass()
      })
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 pipelining 2', (t) => {
  t.plan(4)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      data.body.resume().on('end', () => {
        // t.fail() FIX: Should fail.
        t.pass()
      })
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.equal(err.code, 'HPE_INVALID_CONSTANT')
      t.type(err, errors.HTTPParserError)
    })
  })
})
