'use strict'

const { test } = require('node:test')
const assert = require('assert')
const { Agent, WebSocket } = require('../..')

test('Setting custom headers', (t) => {
  const headers = {
    'x-khafra-hello': 'hi',
    Authorization: 'Bearer base64orsomethingitreallydoesntmatter'
  }

  return new Promise((resolve, reject) => {
    class TestAgent extends Agent {
      dispatch (options) {
        assert.match(options.headers, headers)
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
