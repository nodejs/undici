'use strict'

const { test, describe, after } = require('node:test')
const assert = require('node:assert')
const { WebSocketServer } = require('ws')
const { MessageEvent, CloseEvent, ErrorEvent } = require('../../lib/web/websocket/events')
const { WebSocket } = require('../..')

test('MessageEvent', () => {
  assert.throws(() => new MessageEvent(), TypeError, 'no arguments')
  assert.throws(() => new MessageEvent('').initMessageEvent(), TypeError)

  const noInitEvent = new MessageEvent('message')

  assert.equal(noInitEvent.origin, '')
  assert.equal(noInitEvent.data, null)
  assert.equal(noInitEvent.lastEventId, '')
  assert.equal(noInitEvent.source, null)
  assert.ok(Array.isArray(noInitEvent.ports))
  assert.ok(Object.isFrozen(noInitEvent.ports))
  assert.ok(new MessageEvent('').initMessageEvent('message') instanceof MessageEvent)
})

test('CloseEvent', () => {
  assert.throws(() => new CloseEvent(), TypeError)

  const noInitEvent = new CloseEvent('close')

  assert.equal(noInitEvent.wasClean, false)
  assert.equal(noInitEvent.code, 0)
  assert.equal(noInitEvent.reason, '')
})

test('ErrorEvent', () => {
  assert.throws(() => new ErrorEvent(), TypeError)

  const noInitEvent = new ErrorEvent('error')

  assert.equal(noInitEvent.message, '')
  assert.equal(noInitEvent.filename, '')
  assert.equal(noInitEvent.lineno, 0)
  assert.equal(noInitEvent.colno, 0)
  assert.equal(noInitEvent.error, undefined)
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
    test('should be null initially', () => {
      assert.strictEqual(ws.onopen, null)
    })

    test('should not allow non-function assignments', () => {
      ws.onopen = 3
      assert.strictEqual(ws.onopen, null)
    })

    test('should allow function assignments', () => {
      ws.onopen = listen
      assert.strictEqual(ws.onopen, listen)
    })
  })

  describe('onerror', () => {
    test('should be null initially', () => {
      assert.strictEqual(ws.onerror, null)
    })

    test('should not allow non-function assignments', () => {
      ws.onerror = 3
      assert.strictEqual(ws.onerror, null)
    })

    test('should allow function assignments', () => {
      ws.onerror = listen
      assert.strictEqual(ws.onerror, listen)
    })
  })

  describe('onclose', () => {
    test('should be null initially', () => {
      assert.strictEqual(ws.onclose, null)
    })

    test('should not allow non-function assignments', () => {
      ws.onclose = 3
      assert.strictEqual(ws.onclose, null)
    })

    test('should allow function assignments', () => {
      ws.onclose = listen
      assert.strictEqual(ws.onclose, listen)
    })
  })

  describe('onmessage', () => {
    test('should be null initially', () => {
      assert.strictEqual(ws.onmessage, null)
    })

    test('should not allow non-function assignments', () => {
      ws.onmessage = 3
      assert.strictEqual(ws.onmessage, null)
    })

    test('should allow function assignments', () => {
      ws.onmessage = listen
      assert.strictEqual(ws.onmessage, listen)
    })
  })
})

describe('CloseEvent WPTs ported', () => {
  test('initCloseEvent', () => {
    // Taken from websockets/interfaces/CloseEvent/historical.html
    assert.ok(!('initCloseEvent' in CloseEvent.prototype))
    assert.ok(!('initCloseEvent' in new CloseEvent('close')))
  })

  test('CloseEvent constructor', () => {
    // Taken from websockets/interfaces/CloseEvent/constructor.html

    {
      const event = new CloseEvent('foo')

      assert.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      assert.equal(event.type, 'foo')
      assert.ok(!event.bubbles, 'bubbles')
      assert.ok(!event.cancelable, 'cancelable')
      assert.ok(!event.wasClean, 'wasClean')
      assert.equal(event.code, 0)
      assert.equal(event.reason, '')
    }

    {
      const event = new CloseEvent('foo', {
        bubbles: true,
        cancelable: true,
        wasClean: true,
        code: 7,
        reason: 'x'
      })
      assert.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      assert.equal(event.type, 'foo')
      assert.ok(event.bubbles, 'bubbles')
      assert.ok(event.cancelable, 'cancelable')
      assert.ok(event.wasClean, 'wasClean')
      assert.equal(event.code, 7)
      assert.equal(event.reason, 'x')
    }
  })
})

describe('ErrorEvent WPTs ported', () => {
  test('Synthetic ErrorEvent', () => {
    // Taken from html/webappapis/scripting/events/event-handler-processing-algorithm-error/document-synthetic-errorevent.html

    {
      const e = new ErrorEvent('error')
      assert.equal(e.message, '')
      assert.equal(e.filename, '')
      assert.equal(e.lineno, 0)
      assert.equal(e.colno, 0)
      assert.equal(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: null })
      assert.equal(e.error, null)
    }

    {
      const e = new ErrorEvent('error', { error: undefined })
      assert.equal(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: 'foo' })
      assert.equal(e.error, 'foo')
    }
  })

  test('webidl', () => {
    // Taken from webidl/ecmascript-binding/no-regexp-special-casing.any.js

    const regExp = new RegExp()
    regExp.message = 'some message'

    const errorEvent = new ErrorEvent('type', regExp)

    assert.equal(errorEvent.message, 'some message')
  })

  test('initErrorEvent', () => {
    // Taken from workers/Worker_dispatchEvent_ErrorEvent.htm

    const e = new ErrorEvent('error')
    assert.ok(!('initErrorEvent' in e), 'should not be supported')
  })
})
