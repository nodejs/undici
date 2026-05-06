'use strict'

const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { WebSocket } = require('../..')

// https://github.com/nodejs/undici/issues/3697#issuecomment-2399493917
test('readyState becomes CLOSED after a failed opening handshake', async (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    res.writeHead(404)
    res.end()
  })

  t.after(() => server.close())

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/non-existing-url`)

  ws.addEventListener('error', ({ error }) => {
    t.assert.ok(error instanceof Error)
  })

  await new Promise((resolve) => {
    ws.addEventListener('close', () => {
      t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
      resolve()
    }, { once: true })
  })
})
