'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { WebSocket } = require('../..')

test('Constructor', () => {
  assert.throws(
    () => new WebSocket('abc'),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  assert.throws(
    () => new WebSocket('wss://echo.websocket.events/#a'),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  assert.throws(
    () => new WebSocket('wss://echo.websocket.events', ''),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  assert.throws(
    () => new WebSocket('wss://echo.websocket.events', ['chat', 'chat']),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  assert.throws(
    () => new WebSocket('wss://echo.websocket.events', ['<>@,;:\\"/[]?={}\t']),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )
})
