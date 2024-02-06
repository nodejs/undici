'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const net = require('node:net')

test('ignore informational response', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeProcessing()
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: 'hello'
    }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('error 103 body', (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    socket.write('HTTP/1.1 103 Early Hints\r\n')
    socket.write('Content-Length: 1\r\n')
    socket.write('\r\n')
    socket.write('a\r\n')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.equal(err.code, 'HPE_INVALID_CONSTANT')
    })
    client.on('disconnect', () => {
      t.pass()
    })
  })
})

test('error 100 body', (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    socket.write('HTTP/1.1 100 Early Hints\r\n')
    socket.write('\r\n')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.equal(err.message, 'bad response')
    })
    client.on('disconnect', () => {
      t.pass()
    })
  })
})

test('error 101 upgrade', (t) => {
  t.plan(2)

  const server = net.createServer((socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: example/1\r\nConnection: Upgrade\r\n')
    socket.write('\r\n')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.equal(err.message, 'bad upgrade')
    })
    client.on('disconnect', () => {
      t.pass()
    })
  })
})

test('1xx response without timeouts', t => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeProcessing()
    setTimeout(() => req.pipe(res), 2000)
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 0,
      headersTimeout: 0
    })
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      body: 'hello'
    }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.equal('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})
