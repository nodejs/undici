'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('net')

const sendCharEvery = 1000

test('headers timeout', (t) => {
  t.plan(1)

  let interval

  const server = createServer((socket) => {
    socket.write('HTTP/1.1 200 OK\r\n')

    socket.write('TEST: ASD\r\n')
    socket.write('X-CRASH: ')

    interval = setInterval(() => {
      socket.write('a')
    }, sendCharEvery)
  })
  t.tearDown(server.close.bind(server))
  t.tearDown(() => {
    clearInterval(interval)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headersTimeout: sendCharEvery * 2
    }, (err, data) => {
      t.ok(err instanceof errors.HeadersTimeoutError)
    })
  })
})
