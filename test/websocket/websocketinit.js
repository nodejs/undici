'use strict'

const { test, describe } = require('node:test')
const assert = require('node:assert')
const { WebSocketServer } = require('ws')
const { WebSocket, Dispatcher, Agent } = require('../..')

describe('WebSocketInit', () => {
  class WsDispatcher extends Dispatcher {
    constructor () {
      super()
      this.agent = new Agent()
    }

    dispatch () {
      return this.agent.dispatch(...arguments)
    }
  }

  test('WebSocketInit as 2nd param', () => {
    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.send(Buffer.from('hello, world'))
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
      dispatcher: new WsDispatcher()
    })

    return new Promise((resolve, reject) => {
      ws.onerror = reject

      ws.addEventListener('message', async (event) => {
        assert.equal(await event.data.text(), 'hello, world')
        server.close()
        ws.close()
        resolve()
      })
    })
  })
})
