'use strict'

const { test } = require('node:test')
const assert = require('assert')
const { Agent, WebSocket } = require('../..')

test('Setting custom headers', (t) => {
  const headers = {
    'x-khafra-hello': 'hi',
    Authorization: 'Bearer base64orsomethingitreallydoesntmatter'
  }

  class TestAgent extends Agent {
    dispatch (options) {
      assert.match(options.headers, headers)

      return false
    }
  }

  new WebSocket('wss://echo.websocket.events', {
    headers,
    dispatcher: new TestAgent()
  })
})
