'use strict'

const { test } = require('node:test')
const { createServer } = require('node:net')
const { once } = require('node:events')
const { Client, fetch } = require('..')

// https://github.com/nodejs/undici/issues/5899

function createUnsolicited100Server () {
  const sockets = new Set()
  const server = createServer((socket) => {
    sockets.add(socket)
    let buffered = ''
    socket.on('data', (chunk) => {
      buffered += chunk.toString('latin1')
      let idx
      while ((idx = buffered.indexOf('\r\n\r\n')) !== -1) {
        buffered = buffered.slice(idx + 4)
        socket.write('HTTP/1.1 100 Continue\r\n\r\n')
        socket.write('HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello')
      }
    })
  })
  return { server, sockets }
}

test('unsolicited 100 Continue is ignored by Client', { timeout: 60000 }, async (t) => {
  t.plan(5)

  const { server, sockets } = createUnsolicited100Server()
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  for (let i = 0; i < 2; i++) {
    const { statusCode, body } = await client.request({ path: '/', method: 'GET' })
    t.assert.strictEqual(statusCode, 200)
    t.assert.strictEqual(await body.text(), 'hello')
  }

  // The connection is kept alive and reused for the second request.
  t.assert.strictEqual(sockets.size, 1)
})

test('unsolicited 100 Continue is ignored by fetch', { timeout: 60000 }, async (t) => {
  t.plan(2)

  const { server } = createUnsolicited100Server()
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  const response = await fetch(`http://localhost:${server.address().port}/`, {
    dispatcher: client
  })

  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'hello')
})
