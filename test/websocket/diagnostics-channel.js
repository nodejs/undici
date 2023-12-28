'use strict'

const assert = require('node:assert')
const { describe, it, before, after, beforeEach, afterEach } = require('node:test')
const dc = require('diagnostics_channel')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

describe('diagnostics channel', () => {
  let server
  let listener

  before((done) => {
    server = new WebSocketServer({ port: 0 })
    server.on('listening', done)
  })

  after((done) => {
    server.close(done)
  })

  describe('undici:websocket:open', () => {
    beforeEach(() => {
      listener = ({ extensions, protocol }) => {
        assert.strictEqual(extensions, null)
        assert.strictEqual(protocol, 'chat')
      }
      dc.channel('undici:websocket:open').subscribe(listener)
    })

    afterEach(() => {
      dc.channel('undici:websocket:open').unsubscribe(listener)
    })

    it('should test WebSocket open event', (done) => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.addEventListener('open', () => {
        assert.ok(true, 'Emitted open')
        ws.close()
        done()
      })
    })
  })

  describe('undici:websocket:close', () => {
    beforeEach(() => {
      listener = ({ websocket, code, reason }) => {
        assert(websocket instanceof WebSocket)
        assert.strictEqual(code, 1000)
        assert.strictEqual(reason, 'goodbye')
      }
      dc.channel('undici:websocket:close').subscribe(listener)
    })

    afterEach(() => {
      dc.channel('undici:websocket:close').unsubscribe(listener)
    })

    it('should test WebSocket close event', (done) => {
      const ws = new WebSocket(`ws://localhost:${server.address().port}`, 'chat')

      ws.addEventListener('close', () => {
        assert.ok(true, 'Emitted close')
        done()
      })

      server.on('connection', (ws) => {
        ws.close(1000, 'goodbye')
      })
    })
  })
})

