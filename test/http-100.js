'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const net = require('net')

test('ignore informational response', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'POST',
      headers: {
        Expect: '100-continue'
      },
      body: 'hello'
    }, (err, response) => {
      t.error(err)
      const bufs = []
      response.body.on('data', (buf) => {
        bufs.push(buf)
      })
      response.body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})

test('error 101', (t) => {
  t.plan(1)

  const server = net.createServer((socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\n')
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err) => {
      t.ok(err instanceof errors.NotSupportedError)
    })
  })
})
