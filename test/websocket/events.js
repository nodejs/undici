'use strict'

const { test, describe, after } = require('node:test')
const { WebSocketServer } = require('ws')
const { MessageEvent, CloseEvent, ErrorEvent } = require('../../lib/web/websocket/events')
const { WebSocket } = require('../..')

test('MessageEvent', (t) => {
  t.assert.throws(() => new MessageEvent(), TypeError, 'no arguments')
  t.assert.throws(() => new MessageEvent('').initMessageEvent(), TypeError)

  const noInitEvent = new MessageEvent('message')

  t.assert.strictEqual(noInitEvent.origin, '')
  t.assert.strictEqual(noInitEvent.data, null)
  t.assert.strictEqual(noInitEvent.lastEventId, '')
  t.assert.strictEqual(noInitEvent.source, null)
  t.assert.ok(Array.isArray(noInitEvent.ports))
  t.assert.ok(Object.isFrozen(noInitEvent.ports))
  t.assert.ok(new MessageEvent('').initMessageEvent('message') instanceof MessageEvent)
})

test('CloseEvent', (t) => {
  t.assert.throws(() => new CloseEvent(), TypeError)

  const noInitEvent = new CloseEvent('close')

  t.assert.strictEqual(noInitEvent.wasClean, false)
  t.assert.strictEqual(noInitEvent.code, 0)
  t.assert.strictEqual(noInitEvent.reason, '')
})

test('ErrorEvent', (t) => {
  t.assert.throws(() => new ErrorEvent(), TypeError)

  const noInitEvent = new ErrorEvent('error')

  t.assert.strictEqual(noInitEvent.message, '')
  t.assert.strictEqual(noInitEvent.filename, '')
  t.assert.strictEqual(noInitEvent.lineno, 0)
  t.assert.strictEqual(noInitEvent.colno, 0)
  t.assert.strictEqual(noInitEvent.error, undefined)
})

describe('Event handlers', () => {
  const server = new WebSocketServer({ port: 0 })
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  after(() => {
    server.close()
    ws.close()
  })

  function listen () {}

  describe('onopen', () => {
    test('should be null initially', (t) => {
      t.assert.strictEqual(ws.onopen, null)
    })

    test('should not allow non-function assignments', (t) => {
      ws.onopen = 3
      t.assert.strictEqual(ws.onopen, null)
    })

    test('should allow function assignments', (t) => {
      ws.onopen = listen
      t.assert.strictEqual(ws.onopen, listen)
    })
  })

  describe('onerror', () => {
    test('should be null initially', (t) => {
      t.assert.strictEqual(ws.onerror, null)
    })

    test('should not allow non-function assignments', (t) => {
      ws.onerror = 3
      t.assert.strictEqual(ws.onerror, null)
    })

    test('should allow function assignments', (t) => {
      ws.onerror = listen
      t.assert.strictEqual(ws.onerror, listen)
    })
  })

  describe('onclose', () => {
    test('should be null initially', (t) => {
      t.assert.strictEqual(ws.onclose, null)
    })

    test('should not allow non-function assignments', (t) => {
      ws.onclose = 3
      t.assert.strictEqual(ws.onclose, null)
    })

    test('should allow function assignments', (t) => {
      ws.onclose = listen
      t.assert.strictEqual(ws.onclose, listen)
    })
  })

  describe('onmessage', () => {
    test('should be null initially', (t) => {
      t.assert.strictEqual(ws.onmessage, null)
    })

    test('should not allow non-function assignments', (t) => {
      ws.onmessage = 3
      t.assert.strictEqual(ws.onmessage, null)
    })

    test('should allow function assignments', (t) => {
      ws.onmessage = listen
      t.assert.strictEqual(ws.onmessage, listen)
    })
  })
})

describe('CloseEvent WPTs ported', () => {
  test('initCloseEvent', (t) => {
    // Taken from websockets/interfaces/CloseEvent/historical.html
    t.assert.ok(!('initCloseEvent' in CloseEvent.prototype))
    t.assert.ok(!('initCloseEvent' in new CloseEvent('close')))
  })

  test('CloseEvent constructor', (t) => {
    // Taken from websockets/interfaces/CloseEvent/constructor.html

    {
      const event = new CloseEvent('foo')

      t.assert.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      t.assert.strictEqual(event.type, 'foo')
      t.assert.ok(!event.bubbles, 'bubbles')
      t.assert.ok(!event.cancelable, 'cancelable')
      t.assert.ok(!event.wasClean, 'wasClean')
      t.assert.strictEqual(event.code, 0)
      t.assert.strictEqual(event.reason, '')
    }

    {
      const event = new CloseEvent('foo', {
        bubbles: true,
        cancelable: true,
        wasClean: true,
        code: 7,
        reason: 'x'
      })
      t.assert.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      t.assert.strictEqual(event.type, 'foo')
      t.assert.ok(event.bubbles, 'bubbles')
      t.assert.ok(event.cancelable, 'cancelable')
      t.assert.ok(event.wasClean, 'wasClean')
      t.assert.strictEqual(event.code, 7)
      t.assert.strictEqual(event.reason, 'x')
    }
  })
})

describe('ErrorEvent WPTs ported', () => {
  test('Synthetic ErrorEvent', (t) => {
    // Taken from html/webappapis/scripting/events/event-handler-processing-algorithm-error/document-synthetic-errorevent.html

    {
      const e = new ErrorEvent('error')
      t.assert.strictEqual(e.message, '')
      t.assert.strictEqual(e.filename, '')
      t.assert.strictEqual(e.lineno, 0)
      t.assert.strictEqual(e.colno, 0)
      t.assert.strictEqual(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: null })
      t.assert.strictEqual(e.error, null)
    }

    {
      const e = new ErrorEvent('error', { error: undefined })
      t.assert.strictEqual(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: 'foo' })
      t.assert.strictEqual(e.error, 'foo')
    }
  })

  test('webidl', (t) => {
    // Taken from webidl/ecmascript-binding/no-regexp-special-casing.any.js

    const regExp = new RegExp()
    regExp.message = 'some message'

    const errorEvent = new ErrorEvent('type', regExp)

    t.assert.strictEqual(errorEvent.message, 'some message')
  })

  test('initErrorEvent', (t) => {
    // Taken from workers/Worker_dispatchEvent_ErrorEvent.htm

    const e = new ErrorEvent('error')
    t.assert.ok(!('initErrorEvent' in e), 'should not be supported')
  })
})
