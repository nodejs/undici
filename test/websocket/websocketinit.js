'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { WebSocket, Dispatcher, Agent } = require('../..')

test('WebSocketInit', (t) => {
  t.plan(2)

  class WsDispatcher extends Dispatcher {
    constructor () {
      super()
      this.agent = new Agent()
    }

    dispatch () {
      t.pass()
      return this.agent.dispatch(...arguments)
    }
  }

  t.test('WebSocketInit as 2nd param', (t) => {
    t.plan(1)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.send(Buffer.from('hello, world'))
    })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`, {
      dispatcher: new WsDispatcher()
    })

    ws.onerror = t.fail

    ws.addEventListener('message', async (event) => {
      t.equal(await event.data.text(), 'hello, world')
      server.close()
      ws.close()
    })
  })
})
