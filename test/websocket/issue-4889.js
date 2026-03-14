const { test } = require('node:test')
const http = require('node:http')
const crypto = require('node:crypto')
const { WebSocket } = require('../..')
const { createDeferredPromise } = require('../../lib/util/promise')

test('WebSocket basic auth', (t) => {
  const server = http.createServer()

  server.on('upgrade', (req, socket) => {
    const auth = req.headers.authorization
    if (!auth || auth !== `Basic ${Buffer.from('user:pass').toString('base64')}`) {
      socket.write(
        'HTTP/1.1 401 Unauthorized\r\n' +
        'WWW-Authenticate: Basic realm="test"\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n'
      )
      socket.destroy()
      return
    }

    const key = req.headers['sec-websocket-key']
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64')

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n' +
      '\r\n'
    )

    socket.on('data', () => socket.destroy())
  }).listen(0)

  const { port } = server.address()
  const url = `ws://user:pass@127.0.0.1:${port}/path`

  const ws = new WebSocket(url)

  t.after(() => {
    ws.close()
    server.close()
  })

  const promise = createDeferredPromise()

  ws.addEventListener('open', () => {
    promise.resolve()
    ws.send('h')
  })

  ws.addEventListener('error', (e) => {
    promise.reject(e)
  })

  return promise.promise
})
