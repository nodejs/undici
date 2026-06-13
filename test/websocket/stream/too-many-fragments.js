'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const {
  Agent,
  WebSocketStream,
  getGlobalDispatcher,
  setGlobalDispatcher
} = require('../../..')

test('Too many fragments via WebSocketStream triggers close 1008', async (t) => {
  // WebSocketStream reads its dispatcher from the global one (its options
  // dictionary doesn't accept a dispatcher), so we swap it for the duration
  // of this test. The fragment-count limit must apply to WebSocketStream
  // the same way it applies to the WebSocket API.
  const previous = getGlobalDispatcher()
  const agent = new Agent({
    webSocket: {
      maxFragments: 3
    }
  })
  setGlobalDispatcher(agent)

  const server = new WebSocketServer({ port: 0 })

  t.after(async () => {
    setGlobalDispatcher(previous)
    await agent.close()
    server.close()
  })

  const serverClose = new Promise((resolve) => {
    server.on('connection', (ws) => {
      ws.on('close', (code, reason) => {
        resolve({ code, reason: reason.toString() })
      })

      const fragment = Buffer.from('a')
      const options = { fin: false }

      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
      ws.send(fragment, options)
    })
  })

  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`)

  // The connection will be failed by the parser; both `opened` and `closed`
  // settle. We only care that the server observed the policy-violation close.
  await Promise.allSettled([wss.opened, wss.closed])

  const observed = await serverClose
  t.assert.deepStrictEqual(observed.code, 1008)
  t.assert.deepStrictEqual(observed.reason, 'Too many message fragments')
})
