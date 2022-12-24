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
