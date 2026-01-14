'use strict'

const { test } = require('node:test')
const { WebSocketStream } = require('../../..')
const { createServer } = require('node:http')

// https://github.com/nodejs/undici/issues/4732
test('WebSocketStream rejects opened/closed promises when connection fails', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(404)
    res.end('Not Found')
  })

  await new Promise(resolve => server.listen(0, resolve))
  t.after(() => server.close())

  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`)

  await t.assert.rejects(wss.opened, {
    name: 'WebSocketError',
    message: 'Socket never opened'
  })

  await t.assert.rejects(wss.closed, {
    name: 'WebSocketError'
  })
})
