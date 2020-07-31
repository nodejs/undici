'use strict'

const { test } = require('tap')
const { Client } = require('..')
const http = require('http')

test('basic connect', (t) => {
  t.plan(2)

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

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    client.connect({
      path: '/'
    }, (err, data) => {
      t.error(err)

      const { socket } = data

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
})
