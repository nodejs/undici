'use strict'

const { test, after } = require('node:test')
const { Client, errors } = require('..')
const net = require('node:net')

test('https://github.com/mcollina/undici/issues/810', (t, done) => {
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
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 2 })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ifError(err)
      data.body.resume().on('end', () => {
        // t.assert.fail() FIX: Should fail.
        t.assert.ok(true, 'pass')
      }).on('error', err => {
        t.assert.ok(err instanceof errors.HTTPParserError)
      }
      )
    })
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ok(err instanceof errors.HTTPParserError)
      done()
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 no pipelining', (t, done) => {
  t.plan(2)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ifError(err)
      data.body.resume().on('end', () => {
        // t.assert.fail() FIX: Should fail.
        t.assert.ok(true, 'pass')
        done()
      })
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 pipelining', (t, done) => {
  t.plan(2)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ifError(err)
      data.body.resume().on('end', () => {
        // t.assert.fail() FIX: Should fail.
        t.assert.ok(true, 'pass')
        done()
      })
    })
  })
})

test('https://github.com/mcollina/undici/issues/810 pipelining 2', (t, done) => {
  t.plan(3)

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Content-Length: 1\r\n\r\n')
    socket.write('11111\r\n')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ifError(err)
      data.body.resume().on('end', () => {
        // t.assert.fail() FIX: Should fail.
        t.assert.ok(true, 'pass')
      })
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.assert.ok(err instanceof errors.HTTPParserError)
      done()
    })
  })
})
