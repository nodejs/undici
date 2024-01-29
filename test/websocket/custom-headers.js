'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Agent, WebSocket } = require('../..')

test('Setting custom headers', (t) => {
  const headers = {
    'x-khafra-hello': 'hi',
    Authorization: 'Bearer base64orsomethingitreallydoesntmatter'
  }

  return new Promise((resolve, reject) => {
    class TestAgent extends Agent {
      dispatch (options) {
        assert.deepStrictEqual(options.headers['x-khafra-hello'], headers['x-khafra-hello'])
        assert.deepStrictEqual(options.headers.Authorization, headers.Authorization)
        resolve()
        return false
      }
    }

    const ws = new WebSocket('wss://echo.websocket.events', {
      headers,
      dispatcher: new TestAgent()
    })

    ws.onclose = ws.onerror = ws.onmessage = reject
  })
})
