'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')
const { ByteParser } = require('../../lib/web/websocket/receiver')

test('Parser errors close the connection with 1002 (Protocol Error)', async (t) => {
  const originalWrite = ByteParser.prototype._write
  ByteParser.prototype._write = function (chunk, enc, cb) {
    this.emit('error', new Error('simulated parser error'))
    cb()
  }
  t.after(() => {
    ByteParser.prototype._write = originalWrite
  })

  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise((resolve) => server.on('listening', resolve))
  t.after(() => server.close())

  const receivedCode = new Promise((resolve) => {
    server.on('connection', (serverWs) => {
      serverWs.on('close', (code) => resolve(code))
      // Trigger the patched parser with any valid frame (a PING).
      serverWs._socket.write(Buffer.from([0x89, 0x00]))
    })
  })

  const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}`)
  t.after(() => ws.close())

  t.assert.strictEqual(await receivedCode, 1002)
})
