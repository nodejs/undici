const { request } = require('..')
const { test, after } = require('node:test')
const net = require('node:net')
const { once } = require('node:events')
const assert = require('node:assert')

test('https://github.com/mcollina/undici/issues/3136', async (t) => {
  const server = net.createServer((socket) => {
    socket.write('HTTP/1.1 404 Not Found\r\n')
    socket.write('Transfer-Encoding: chunked\r\n\r\n')
    socket.write('\r\n')
  })
  after(() => server.close())
  server.listen(0)
  await once(server, 'listening')
  await assert.rejects(
    request(`http://localhost:${server.address().port}`, {
      throwOnError: true
    })
  )
})
