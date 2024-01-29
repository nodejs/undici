'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const dc = require('node:diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

describe('diagnostics channel', { concurrency: 1 }, () => {
  test('undici:websocket:open', () => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000, 'goodbye')
    })

    const listener = ({ extensions, protocol }) => {
      assert.equal(extensions, null)
      assert.equal(protocol, 'chat')
    }

    const { port } = server.address()

    dc.channel('undici:websocket:open').subscribe(listener)

    const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

    return new Promise((resolve) => {
      ws.addEventListener('open', () => {
        dc.channel('undici:websocket:open').unsubscribe(listener)
        server.close()
        resolve()
      })
    })
  })

  test('undici:websocket:close', () => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.close(1000, 'goodbye')
    })

    const listener = ({ websocket, code, reason }) => {
      assert.ok(websocket instanceof WebSocket)
      assert.equal(code, 1000)
      assert.equal(reason, 'goodbye')
    }

    const { port } = server.address()

    dc.channel('undici:websocket:close').subscribe(listener)

    const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

    return new Promise((resolve) => {
      ws.addEventListener('close', () => {
        dc.channel('undici:websocket:close').unsubscribe(listener)
        server.close()
        resolve()
      })
    })
  })
})
