'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket, ping } = require('../..')
const { once } = require('node:events')

test('ping', async (t) => {
  t.plan(1)

  const pingBody = Buffer.from('ping body')
  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', (b) => {
      t.assert.deepStrictEqual(b, pingBody)
      ws.close()
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)
  ws.onopen = () => ping(ws, pingBody)

  t.after(() => {
    ws.close()
    wss.close()
  })

  await once(ws, 'close')
})

test('attempting to send invalid ping body', (t) => {
  t.plan(2)

  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', () => {
      t.assert.fail('Received unexpected ping')
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)

  t.assert.throws(() => ping(ws, Buffer.from('a'.repeat(126))))
  t.assert.throws(() => ping(ws, 'a'.repeat(125)))

  t.after(() => {
    ws.close()
    wss.close()
  })
})

test('ping with no payload', async (t) => {
  t.plan(1)

  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', (b) => {
      t.assert.deepStrictEqual(b, Buffer.alloc(0))
      ws.close()
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)
  ws.onopen = () => ping(ws)

  t.after(() => {
    ws.close()
    wss.close()
  })

  await once(ws, 'close')
})
