'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const net = require('node:net')
const { Client, errors } = require('..')

test('https://github.com/mcollina/undici/issues/268', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\n')
    socket.write('Transfer-Encoding: chunked\r\n\r\n')
    setTimeout(() => {
      socket.write('1\r\n')
      socket.write('\n\r\n')
      setTimeout(() => {
        socket.write('1\r\n')
        socket.write('\n\r\n')
      }, 500)
    }, 500)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/nxt/_changes?feed=continuous&heartbeat=5000',
      headersTimeout: 1e3
    }, (err, data) => {
      t.ifError(err)
      data.body
        .resume()
      setTimeout(() => {
        t.ok(true, 'pass')
        data.body.on('error', () => {})
      }, 2e3)
    })
  })

  await t.completed
})

test('parser fail', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTT/1.1 200 OK\r\n')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ok(err)
      t.ok(err instanceof errors.HTTPParserError)
    })
  })

  await t.completed
})

test('split header field', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nA')
    setTimeout(() => {
      socket.write('SD: asd,asd\r\n\r\n\r\n')
    }, 100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ifError(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })

  await t.completed
})

test('split header value', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = net.createServer(socket => {
    socket.write('HTTP/1.1 200 OK\r\nASD: asd')
    setTimeout(() => {
      socket.write(',asd\r\n\r\n\r\n')
    }, 100)
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.destroy())

    client.request({
      method: 'GET',
      path: '/'
    }, (err, data) => {
      t.ifError(err)
      t.equal(data.headers.asd, 'asd,asd')
      data.body.destroy().on('error', () => {})
    })
  })

  await t.completed
})
