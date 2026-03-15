'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')

const { WebSocket } = require('../..')
const { closeServerAsPromise } = require('../utils/node-http')

// https://github.com/nodejs/undici/issues/4889
test('websocket auth retry preserves path when URL contains credentials', async (t) => {
  const expectedAuth = `Basic ${Buffer.from('user:pass').toString('base64')}`

  let attempts = 0

  const server = createServer()
  const wss = new WebSocketServer({ noServer: true })

  t.after(async () => {
    for (const client of wss.clients) {
      client.terminate()
    }

    await new Promise((resolve) => wss.close(resolve))
    await closeServerAsPromise(server)()
  })

  server.on('upgrade', (req, socket, head) => {
    attempts++
    t.assert.strictEqual(req.url, '/path')

    if (attempts === 1) {
      t.assert.strictEqual(req.headers.authorization, undefined)
      socket.write(
        'HTTP/1.1 401 Unauthorized\r\n' +
        'WWW-Authenticate: Basic realm="test"\r\n' +
        'Content-Length: 0\r\n' +
        '\r\n'
      )
      socket.destroy()
      return
    }

    if (attempts === 2) {
      t.assert.strictEqual(req.headers.authorization, expectedAuth)
      wss.handleUpgrade(req, socket, head, (websocket) => {
        wss.emit('connection', websocket, req)
      })
      return
    }

    t.assert.fail(`unexpected upgrade attempt #${attempts}`)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const ws = new WebSocket(`ws://user:pass@127.0.0.1:${server.address().port}/path`)

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', ({ error }) => reject(error), { once: true })
  })

  t.assert.strictEqual(attempts, 2)
})
