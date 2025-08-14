'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket, ping } = require('../..')
const { tspl } = require('@matteo.collina/tspl')

test('ping', async (t) => {
  const { deepStrictEqual, completed } = tspl(t, { plan: 1 })

  const pingBody = Buffer.from('ping body')
  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', (b) => {
      deepStrictEqual(b, pingBody)
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)
  ws.onopen = () => ping(ws, pingBody)

  t.after(() => {
    ws.close()
    wss.close()
  })

  await completed
})

test('attempting to send invalid ping body', async (t) => {
  const { completed, throws, fail } = tspl(t, { plan: 2 })

  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', () => {
      fail('Received unexpected ping')
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)

  throws(() => ping(ws, Buffer.from('a'.repeat(126))))
  throws(() => ping(ws, 'a'.repeat(125)))

  t.after(() => {
    ws.close()
    wss.close()
  })

  await completed
})

test('ping with no payload', async (t) => {
  const { completed, deepStrictEqual } = tspl(t, { plan: 1 })

  const wss = new WebSocketServer({ port: 0 })

  wss.on('connection', (ws) => {
    ws.on('ping', (b) => {
      deepStrictEqual(b, Buffer.alloc(0))
    })
  })

  const ws = new WebSocket(`ws://localhost:${wss.address().port}`)
  ws.onopen = () => ping(ws)

  t.after(() => {
    ws.close()
    wss.close()
  })

  await completed
})
