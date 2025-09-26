'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Receiving a close frame with invalid utf-8', (t, done) => {
  t.plan(2)

  const server = new WebSocketServer({ port: 0 })
  t.after(() => {
    server.close()
  })

  server.on('connection', (ws) => {
    ws.close(1000, Buffer.from([0xFF, 0xFE]))

    ws.on('close', (code) => {
      t.assert.strictEqual(code, 1007)
      done()
    })
  })

  const events = []
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)
  t.after(() => { ws.close() })

  ws.addEventListener('close', (e) => {
    events.push({ type: 'close', code: e.code })
  })

  ws.addEventListener('error', () => {
    events.push({ type: 'error' })
  })

  once(ws, 'close').then(() => {
    // An error event should be propagated immediately, then we should receive
    // a close event with a 1006 code. The code is 1006, and not 1007 (as we send
    // the server) because the connection is closed before the server responds.
    t.assert.deepStrictEqual(events, [
      { type: 'error' },
      { type: 'close', code: 1006 }
    ])
  })
})
