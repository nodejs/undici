'use strict'

const { test } = require('node:test')
const dc = require('node:diagnostics_channel')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { WebSocketServer, WebSocket: WSWebsocket } = require('ws')
const { key, cert } = require('@metcoder95/https-pem')
const { Agent, WebSocket } = require('../..')
const { uid } = require('../../lib/web/websocket/constants')
const { runtimeFeatures } = require('../../lib/util/runtime-features')

const crypto = runtimeFeatures.has('crypto')
  ? require('node:crypto')
  : null

test('diagnostics channel - undici:websocket:open includes handshake response over h2', { skip: crypto == null }, async (t) => {
  t.plan(9)

  const server = createSecureServer({ cert, key, settings: { enableConnectProtocol: true } })
  const wsServer = new WebSocketServer({ noServer: true })

  server.on('stream', (stream, headers) => {
    stream.respond({
      ':status': 200,
      'sec-websocket-accept': crypto.hash('sha1', `${headers['sec-websocket-key']}${uid}`, 'base64')
    })

    const ws = new WSWebsocket(null, null, { autoPong: true })
    ws.setSocket(stream, Buffer.alloc(0), {
      maxPayload: 104857600,
      skipUTF8Validation: false
    })

    wsServer.emit('connection', ws, stream)
  })

  wsServer.on('connection', (ws) => {
    setTimeout(() => {
      ws.close(1000, 'test')
    }, 50)
  })

  server.listen(0)
  await once(server, 'listening')

  const dispatcher = new Agent({
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })

  const openListener = (data) => {
    t.assert.ok(data.address, 'address should be defined')
    t.assert.strictEqual(typeof data.address.address, 'string', 'address.address should be a string')
    t.assert.strictEqual(typeof data.address.port, 'number', 'address.port should be a number')
    t.assert.ok(data.handshakeResponse, 'handshakeResponse should be defined')
    t.assert.strictEqual(data.handshakeResponse.status, 200, 'status should be 200')
    t.assert.strictEqual(data.handshakeResponse.statusText, 'OK', 'statusText should be OK for h2')
    t.assert.ok(data.handshakeResponse.headers, 'headers should be defined')
    t.assert.ok(typeof data.handshakeResponse.headers === 'object', 'headers should be an object')
    t.assert.ok(typeof data.handshakeResponse.headers['sec-websocket-accept'] === 'string', 'sec-websocket-accept header should be a string')
  }

  dc.channel('undici:websocket:open').subscribe(openListener)

  const ws = new WebSocket(`wss://localhost:${server.address().port}`, { dispatcher })

  t.after(async () => {
    dc.channel('undici:websocket:open').unsubscribe(openListener)
    server.close()
    await dispatcher.close()
    await new Promise((resolve) => wsServer.close(resolve))
  })

  await Promise.race([
    once(ws, 'open'),
    once(ws, 'error').then(([event]) => {
      throw event.error ?? new Error('unexpected websocket error')
    })
  ])
  await once(ws, 'close')
})
