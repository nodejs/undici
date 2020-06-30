'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('net')

const nodeMajorVersion = parseInt(process.version.split('.')[0].slice(1))
const sendCharEvery = 1000

if (nodeMajorVersion >= 14) {
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
      const client = new Client(`http://localhost:${server.address().port}`, {
        headersTimeout: sendCharEvery * 2
      })
      t.tearDown(client.close.bind(client))

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        t.ok(err instanceof errors.HeadersTimeoutError)
      })
    })
  })
}
