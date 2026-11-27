'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { fetch, Agent } = require('../..')

// A 205 response must not carry content, but HTTP/1.1 framing still allows a
// body (RFC 9112 6.3). Fetch disregards that body, so there is no reason to
// keep the connection busy waiting for the server to finish sending it.

async function startServer (t, handler, agentOptions) {
  const server = createServer({ joinDuplicateHeaders: true }, handler)
  const sockets = []
  server.on('connection', (socket) => sockets.push(socket))
  server.listen(0)
  await once(server, 'listening')

  const agent = new Agent(agentOptions)
  t.after(async () => {
    for (const socket of sockets) socket.destroy()
    server.close()
    await agent.close()
  })

  return { origin: `http://localhost:${server.address().port}`, sockets, agent }
}

test('fetch closes the connection when a 205 response sends an unterminated body', async (t) => {
  const { origin, sockets, agent } = await startServer(t, (req, res) => {
    res.writeHead(205, { 'transfer-encoding': 'chunked' })
    res.write('x')
    // never end the response
  })

  const response = await fetch(origin, { dispatcher: agent })
  t.assert.strictEqual(response.status, 205)
  t.assert.strictEqual(response.body, null)

  t.assert.strictEqual(sockets.length, 1)
  if (!sockets[0].destroyed) {
    await once(sockets[0], 'close')
  }
})

test('fetch closes the connection when 205 content arrives after the response resolved', async (t) => {
  let sendContent
  const { origin, sockets, agent } = await startServer(t, (req, res) => {
    res.writeHead(205, { 'transfer-encoding': 'chunked' })
    res.flushHeaders()
    sendContent = () => res.write('x')
  })

  const response = await fetch(origin, { dispatcher: agent })
  t.assert.strictEqual(response.status, 205)
  t.assert.strictEqual(response.body, null)

  sendContent()
  await once(sockets[0], 'close')
})

test('fetch reuses the connection for a 205 response without content', async (t) => {
  const { origin, sockets, agent } = await startServer(t, (req, res) => {
    res.writeHead(205, { 'content-length': '0' })
    res.end()
  }, { connections: 1 })

  for (let i = 0; i < 3; i++) {
    const response = await fetch(origin, { dispatcher: agent })
    t.assert.strictEqual(response.status, 205)
    t.assert.strictEqual(response.body, null)
  }

  t.assert.strictEqual(sockets.length, 1)
  t.assert.strictEqual(sockets[0].destroyed, false)
})
