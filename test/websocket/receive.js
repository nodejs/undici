'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Receiving a frame with a payload length > 2^31-1 bytes', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    const socket = ws._socket

    socket.write(Buffer.from([0x81, 0x7F, 0xCA, 0xE5, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00]))
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.onmessage = t.fail

  ws.addEventListener('error', (event) => {
    ws.close()
    server.close()
    t.ok(event.error instanceof Error) // error event is emitted
  })

  await t.completed
})

test('Receiving an ArrayBuffer', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      ws.send(data, { binary: true })

      ws.close(1000)
    })
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.binaryType = 'what'
    t.strictEqual(ws.binaryType, 'blob')

    ws.binaryType = 'arraybuffer' // <--
    ws.send('Hello')
  })

  ws.addEventListener('message', ({ data }) => {
    t.ok(data instanceof ArrayBuffer)
    t.deepStrictEqual(Buffer.from(data), Buffer.from('Hello'))
    server.close()
  })

  await t.completed
})

test('Receiving a close reason', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    ws.on('message', (data, isBinary) => {
      ws.send(data, { binary: true })

      ws.close(1000, Buffer.from('\uFEFFGood Bye!'))
    })
  })

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('open', () => {
    ws.send('Hello')
  })

  ws.addEventListener('close', ({ reason }) => {
    t.strictEqual(reason, 'Good Bye!')
    server.close()
  })

  await t.completed
})
