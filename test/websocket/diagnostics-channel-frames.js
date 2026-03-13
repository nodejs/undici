'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { opcodes } = require('../../lib/web/websocket/constants')

test('diagnostics channel - undici:websocket:[frameSent/frameReceived]', async (t) => {
  t.plan(8)

  const server = new WebSocketServer({ port: 0 })
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  server.on('connection', (socket) => {
    socket.on('message', (payload) => {
      socket.send(payload.toString())
    })
  })

  const frameSentListener = ({ websocket, opcode, mask, payloadData }) => {
    if (opcode !== opcodes.TEXT || payloadData.toString() !== 'hello') {
      return
    }

    t.assert.strictEqual(websocket, ws)
    t.assert.strictEqual(opcode, opcodes.TEXT)
    t.assert.strictEqual(mask, true)
    t.assert.strictEqual(payloadData.toString(), 'hello')
  }

  const frameReceivedListener = ({ websocket, opcode, mask, payloadData }) => {
    if (opcode !== opcodes.TEXT || payloadData.toString() !== 'hello') {
      return
    }

    t.assert.strictEqual(websocket, ws)
    t.assert.strictEqual(opcode, opcodes.TEXT)
    t.assert.strictEqual(mask, false)
    t.assert.strictEqual(payloadData.toString(), 'hello')
  }

  dc.channel('undici:websocket:frameSent').subscribe(frameSentListener)
  dc.channel('undici:websocket:frameReceived').subscribe(frameReceivedListener)

  t.after(() => {
    server.close()
    ws.close()
    dc.channel('undici:websocket:frameSent').unsubscribe(frameSentListener)
    dc.channel('undici:websocket:frameReceived').unsubscribe(frameReceivedListener)
  })

  await once(ws, 'open')
  ws.send('hello')
  await once(ws, 'message')
})
