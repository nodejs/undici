'use strict'

const { test } = require('tap')
const { WebSocket } = require('../..')

test('Constructor', (t) => {
  t.throws(
    () => new WebSocket('abc'),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.throws(
    () => new WebSocket('https://www.google.com'),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.throws(
    () => new WebSocket('wss://echo.websocket.events/#a'),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.throws(
    () => new WebSocket('wss://echo.websocket.events', ''),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.throws(
    () => new WebSocket('wss://echo.websocket.events', ['chat', 'chat']),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.throws(
    () => new WebSocket('wss://echo.websocket.events', ['<>@,;:\\"/[]?={}\t']),
    {
      name: 'SyntaxError',
      constructor: DOMException
    }
  )

  t.end()
})
