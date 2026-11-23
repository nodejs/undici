'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { WebSocketServer } = require('ws')
const {
  Agent,
  WebSocket,
  WebSocketStream,
  getGlobalDispatcher,
  setGlobalDispatcher
} = require('../..')
const { runtimeFeatures } = require('../../lib/util/runtime-features')
const { uid } = require('../../lib/web/websocket/constants')

const crypto = runtimeFeatures.has('crypto')
  ? require('node:crypto')
  : null

// Starts a ws server with permessage-deflate enabled that sends `payload` to
// each client. Resolves `request` with the upgrade request's
// Sec-WebSocket-Extensions header, and `closed` with the close code the
// server observes.
async function startServer (t, payload) {
  const server = new WebSocketServer({ port: 0, perMessageDeflate: { threshold: 0 } })
  t.after(() => server.close())
  await once(server, 'listening')

  let resolveRequest
  let resolveClosed
  const request = new Promise((resolve) => { resolveRequest = resolve })
  const closed = new Promise((resolve) => { resolveClosed = resolve })

  server.on('connection', (ws, req) => {
    resolveRequest(req.headers['sec-websocket-extensions'])
    ws.on('close', (code) => resolveClosed(code))
    ws.send(payload)
  })

  return { url: `ws://127.0.0.1:${server.address().port}`, request, closed }
}

function receiveMessage (ws) {
  return new Promise((resolve, reject) => {
    ws.onerror = ({ error }) => reject(error)
    ws.onmessage = ({ data }) => resolve(data)
  })
}

test('perMessageDeflate defaults to true', async (t) => {
  const agent = new Agent()
  t.after(() => agent.close())

  t.assert.strictEqual(agent.webSocketOptions.perMessageDeflate, true)
})

test('permessage-deflate is offered and negotiated by default', async (t) => {
  const server = await startServer(t, 'hello')
  const agent = new Agent()
  t.after(() => agent.close())

  const ws = new WebSocket(server.url, { dispatcher: agent })
  t.after(() => ws.close())

  t.assert.strictEqual(await receiveMessage(ws), 'hello')
  t.assert.strictEqual(await server.request, 'permessage-deflate; client_max_window_bits')
  t.assert.match(ws.extensions, /^permessage-deflate/)
})

test('perMessageDeflate: false does not offer permessage-deflate', async (t) => {
  const server = await startServer(t, 'hello')
  const agent = new Agent({ webSocket: { perMessageDeflate: false } })
  t.after(() => agent.close())

  const ws = new WebSocket(server.url, { dispatcher: agent })
  t.after(() => ws.close())

  t.assert.strictEqual(await receiveMessage(ws), 'hello')
  t.assert.strictEqual(await server.request, undefined)
  t.assert.strictEqual(ws.extensions, '')
})

test('perMessageDeflate: false keeps the maxPayloadSize limit', async (t) => {
  const server = await startServer(t, Buffer.alloc(2048, 0x41))
  const agent = new Agent({ webSocket: { perMessageDeflate: false, maxPayloadSize: 1024 } })
  t.after(() => agent.close())

  const ws = new WebSocket(server.url, { dispatcher: agent })
  t.after(() => ws.close())
  ws.onmessage = () => ws.close()

  t.assert.strictEqual(await server.request, undefined)
  t.assert.strictEqual(await server.closed, 1009)
})

test('perMessageDeflate: false applies to WebSocketStream through the global dispatcher', async (t) => {
  const server = await startServer(t, 'hello')
  const previous = getGlobalDispatcher()
  const agent = new Agent({ webSocket: { perMessageDeflate: false } })
  setGlobalDispatcher(agent)
  t.after(async () => {
    setGlobalDispatcher(previous)
    await agent.close()
  })

  const wss = new WebSocketStream(server.url)
  const { readable, extensions } = await wss.opened
  const { value } = await readable.getReader().read()
  wss.close()

  t.assert.strictEqual(value, 'hello')
  t.assert.strictEqual(extensions, '')
  t.assert.strictEqual(await server.request, undefined)
})

for (const extension of ['permessage-deflate', 'x-unknown-extension']) {
  test(`perMessageDeflate: false fails the handshake if the server indicates ${extension}`, { skip: crypto === null }, async (t) => {
    let requestedExtensions = null
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      requestedExtensions = req.headers['sec-websocket-extensions']

      res.setHeader('Upgrade', 'websocket')
      res.setHeader('Connection', 'upgrade')
      res.setHeader('Sec-WebSocket-Accept', crypto.hash('sha1', req.headers['sec-websocket-key'] + uid, 'base64'))
      res.setHeader('Sec-WebSocket-Extensions', extension)
      res.statusCode = 101
      res.end()
    })
    t.after(() => server.close())
    await once(server.listen(0), 'listening')

    const agent = new Agent({ webSocket: { perMessageDeflate: false } })
    t.after(() => agent.close())

    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`, { dispatcher: agent })
    ws.onopen = () => t.assert.fail('connection should not open')

    // error and close are fired synchronously one after the other.
    const [[{ error }], [{ code }]] = await Promise.all([once(ws, 'error'), once(ws, 'close')])
    t.assert.ok(error)
    t.assert.strictEqual(code, 1006)
    t.assert.strictEqual(requestedExtensions, undefined)
  })
}
