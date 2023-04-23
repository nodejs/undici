'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { MessageEvent, CloseEvent, ErrorEvent } = require('../../lib/websocket/events')
const { WebSocket } = require('../..')

test('MessageEvent', (t) => {
  t.throws(() => new MessageEvent(), TypeError, 'no arguments')
  t.throws(() => new MessageEvent('').initMessageEvent(), TypeError)

  const noInitEvent = new MessageEvent('message')

  t.equal(noInitEvent.origin, '')
  t.equal(noInitEvent.data, null)
  t.equal(noInitEvent.lastEventId, '')
  t.equal(noInitEvent.source, null)
  t.ok(Array.isArray(noInitEvent.ports))
  t.ok(Object.isFrozen(noInitEvent.ports))
  t.type(new MessageEvent('').initMessageEvent('message'), MessageEvent)

  t.end()
})

test('CloseEvent', (t) => {
  t.throws(() => new CloseEvent(), TypeError)

  const noInitEvent = new CloseEvent('close')

  t.equal(noInitEvent.wasClean, false)
  t.equal(noInitEvent.code, 0)
  t.equal(noInitEvent.reason, '')

  t.end()
})

test('ErrorEvent', (t) => {
  t.throws(() => new ErrorEvent(), TypeError)

  const noInitEvent = new ErrorEvent('error')

  t.equal(noInitEvent.message, '')
  t.equal(noInitEvent.filename, '')
  t.equal(noInitEvent.lineno, 0)
  t.equal(noInitEvent.colno, 0)
  t.equal(noInitEvent.error, undefined)

  t.end()
})

test('Event handlers', (t) => {
  t.plan(4)

  const server = new WebSocketServer({ port: 0 })
  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  function listen () {}

  t.teardown(server.close.bind(server))
  t.teardown(() => ws.close())

  t.test('onopen', (t) => {
    t.plan(3)

    t.equal(ws.onopen, null)
    ws.onopen = 3
    t.equal(ws.onopen, null)
    ws.onopen = listen
    t.equal(ws.onopen, listen)
  })

  t.test('onerror', (t) => {
    t.plan(3)

    t.equal(ws.onerror, null)
    ws.onerror = 3
    t.equal(ws.onerror, null)
    ws.onerror = listen
    t.equal(ws.onerror, listen)
  })

  t.test('onclose', (t) => {
    t.plan(3)

    t.equal(ws.onclose, null)
    ws.onclose = 3
    t.equal(ws.onclose, null)
    ws.onclose = listen
    t.equal(ws.onclose, listen)
  })

  t.test('onmessage', (t) => {
    t.plan(3)

    t.equal(ws.onmessage, null)
    ws.onmessage = 3
    t.equal(ws.onmessage, null)
    ws.onmessage = listen
    t.equal(ws.onmessage, listen)
  })
})

test('CloseEvent WPTs ported', (t) => {
  t.test('initCloseEvent', (t) => {
    // Taken from websockets/interfaces/CloseEvent/historical.html
    t.notOk('initCloseEvent' in CloseEvent.prototype)
    t.notOk('initCloseEvent' in new CloseEvent('close'))

    t.end()
  })

  t.test('CloseEvent constructor', (t) => {
    // Taken from websockets/interfaces/CloseEvent/constructor.html

    {
      const event = new CloseEvent('foo')

      t.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      t.equal(event.type, 'foo')
      t.notOk(event.bubbles, 'bubbles')
      t.notOk(event.cancelable, 'cancelable')
      t.notOk(event.wasClean, 'wasClean')
      t.equal(event.code, 0)
      t.equal(event.reason, '')
    }

    {
      const event = new CloseEvent('foo', {
        bubbles: true,
        cancelable: true,
        wasClean: true,
        code: 7,
        reason: 'x'
      })
      t.ok(event instanceof CloseEvent, 'should be a CloseEvent')
      t.equal(event.type, 'foo')
      t.ok(event.bubbles, 'bubbles')
      t.ok(event.cancelable, 'cancelable')
      t.ok(event.wasClean, 'wasClean')
      t.equal(event.code, 7)
      t.equal(event.reason, 'x')
    }

    t.end()
  })

  t.end()
})

test('ErrorEvent WPTs ported', (t) => {
  t.test('Synthetic ErrorEvent', (t) => {
    // Taken from html/webappapis/scripting/events/event-handler-processing-algorithm-error/document-synthetic-errorevent.html

    {
      const e = new ErrorEvent('error')
      t.equal(e.message, '')
      t.equal(e.filename, '')
      t.equal(e.lineno, 0)
      t.equal(e.colno, 0)
      t.equal(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: null })
      t.equal(e.error, null)
    }

    {
      const e = new ErrorEvent('error', { error: undefined })
      t.equal(e.error, undefined)
    }

    {
      const e = new ErrorEvent('error', { error: 'foo' })
      t.equal(e.error, 'foo')
    }

    t.end()
  })

  t.test('webidl', (t) => {
    // Taken from webidl/ecmascript-binding/no-regexp-special-casing.any.js

    const regExp = new RegExp()
    regExp.message = 'some message'

    const errorEvent = new ErrorEvent('type', regExp)

    t.equal(errorEvent.message, 'some message')

    t.end()
  })

  t.test('initErrorEvent', (t) => {
    // Taken from workers/Worker_dispatchEvent_ErrorEvent.htm

    const e = new ErrorEvent('error')
    t.notOk('initErrorEvent' in e, 'should not be supported')

    t.end()
  })

  t.end()
})
