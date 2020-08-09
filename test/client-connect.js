'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const http = require('http')

test('basic connect', (t) => {
  t.plan(1)

  const server = http.createServer((c) => {
    t.fail()
  })
  server.on('connect', (req, socket, firstBodyChunk) => {
    socket.write('HTTP/1.1 200 Connection established\r\n\r\n')

    let data = firstBodyChunk.toString()
    socket.on('data', (buf) => {
      data += buf.toString()
    })

    socket.on('end', () => {
      socket.end(data)
    })
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    const { socket } = await client.connect({
      path: '/'
    })

    let recvData = ''
    socket.on('data', (d) => {
      recvData += d
    })

    socket.on('end', () => {
      t.strictEqual(recvData.toString(), 'Body')
    })

    socket.write('Body')
    socket.end()
  })
})

test('upgrade invalid opts', (t) => {
  t.plan(2)

  const client = new Client('http://localhost:5432')

  client.connect(null, err => {
    t.ok(err instanceof errors.InvalidArgumentError)
  })

  try {
    client.connect(null, null)
  } catch (err) {
    t.ok(err instanceof errors.InvalidArgumentError)
  }
})
