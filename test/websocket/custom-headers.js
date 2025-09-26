'use strict'

const { test } = require('node:test')
const { Agent, WebSocket } = require('../..')

test('Setting custom headers', (t, done) => {
  const headers = {
    'x-khafra-hello': 'hi',
    Authorization: 'Bearer base64orsomethingitreallydoesntmatter'
  }

  class TestAgent extends Agent {
    dispatch (options) {
      t.assert.deepStrictEqual(options.headers['x-khafra-hello'], headers['x-khafra-hello'])
      t.assert.deepStrictEqual(options.headers.Authorization, headers.Authorization)
      done()
      return false
    }
  }

  const ws = new WebSocket('wss://echo.websocket.events', {
    headers,
    dispatcher: new TestAgent()
  })

  ws.onclose = ws.onerror = ws.onmessage = t.assert.fail
})
