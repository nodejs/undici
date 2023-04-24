'use strict'

const { test } = require('tap')
const assert = require('assert')
const { Agent, WebSocket } = require('../..')

test('Setting custom headers', (t) => {
  t.plan(1)

  const headers = {
    'x-khafra-hello': 'hi',
    Authorization: 'Bearer base64orsomethingitreallydoesntmatter'
  }

  class TestAgent extends Agent {
    dispatch (options) {
      t.match(options.headers, headers)

      return false
    }
  }

  const ws = new WebSocket('wss://echo.websocket.events', {
    headers,
    dispatcher: new TestAgent()
  })

  // We don't want to make a request, just ensure the headers are set.
  ws.onclose = ws.onerror = ws.onmessage = assert.fail
})
