'use strict'

const { describe, test } = require('node:test')
const { createServer } = require('node:http')
const { WebSocket } = require('../..')

describe('issue 4741 - events fire asynchronously when close() is called while CONNECTING', () => {
  test('error and close events are queued, not fired synchronously during close()', async (t) => {
    // The server accepts the upgrade request but never completes the
    // handshake, so the WebSocket stays in the CONNECTING state.
    const server = createServer()
    server.on('upgrade', (req, socket) => {
      socket.on('error', () => {})
    })
    t.after(() => server.close())

    await new Promise((resolve) => server.listen(0, resolve))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    let closeReturned = false
    const events = []

    ws.addEventListener('error', () => {
      events.push(['error', closeReturned])
    })

    const closed = new Promise((resolve) => {
      ws.addEventListener('close', () => {
        events.push(['close', closeReturned, ws.readyState])
        resolve()
      })
    })

    ws.close()
    closeReturned = true

    // Per spec, close() on a CONNECTING socket moves it to CLOSING first;
    // the events must only fire after close() has returned.
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSING)
    t.assert.deepStrictEqual(events, [])

    await closed

    t.assert.deepStrictEqual(events, [
      ['error', true],
      ['close', true, WebSocket.CLOSED]
    ])
    t.assert.strictEqual(ws.readyState, WebSocket.CLOSED)
  })
})
