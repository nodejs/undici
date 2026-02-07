'use strict'

const { test } = require('node:test')
const net = require('node:net')
const { WebSocket } = require('../..')

// Test for https://github.com/nodejs/undici/issues/4625
// When WebSocket closes abnormally (code 1006), error message should be descriptive
test('abnormal closure should have descriptive error message', async (t) => {
  // Create a raw TCP server that accepts the connection but then abruptly closes
  const server = net.createServer((socket) => {
    // Send a valid WebSocket handshake response
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: invalid\r\n' +
            '\r\n'
    )
    // Immediately destroy the socket to simulate abnormal closure
    socket.destroy()
  })

  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port

  const ws = new WebSocket(`ws://localhost:${port}`)

  await new Promise((resolve) => {
    ws.addEventListener('error', (event) => {
      t.assert.ok(event.error instanceof TypeError)
      t.assert.ok(
        event.error.message.length > 0,
        'error message should not be empty'
      )
      t.assert.ok(
        event.error.message.includes('abnormally') ||
                event.error.message.includes('closed'),
        'error message should describe the closure'
      )
      resolve()
    })
  })

  server.close()
})
