'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { after, test } = require('node:test')
const { Client } = require('..')

function readBody (body) {
  return new Promise((resolve, reject) => {
    let data = ''
    body.setEncoding('latin1')
    body.on('data', chunk => { data += chunk })
    body.on('end', () => resolve(data))
    body.on('error', reject)
  })
}

test('should not reuse an idle socket with buffered unsolicited response bytes', async () => {
  let evilServerSocket

  const server = createServer((req, res) => {
    if (!evilServerSocket) {
      evilServerSocket = req.socket
    }

    res.end(req.url)
  })
  after(() => server.close())

  await new Promise(resolve => server.listen(0, resolve))

  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout: 300e3
  })
  after(() => client.close())

  const response1 = await client.request({ path: '/request1', method: 'GET' })
  assert.strictEqual(await readBody(response1.body), '/request1')

  const disconnected = once(client, 'disconnect')

  evilServerSocket.write(
    'HTTP/1.1 200 OK\r\n' +
    'Poison-Free-Socket: true\r\n' +
    'Connection: keep-alive\r\n' +
    'Keep-Alive: timeout=300\r\n' +
    'Content-Length: 0\r\n' +
    '\r\n'
  )

  await disconnected

  const response2 = await client.request({ path: '/request2', method: 'GET' })
  assert.strictEqual(response2.headers['poison-free-socket'], undefined)
  assert.strictEqual(await readBody(response2.body), '/request2')
})
