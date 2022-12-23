'use strict'

const { test } = require('tap')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

test('Close', (t) => {
  t.plan(5)

  t.test('Close with code', (t) => {
    t.plan(1)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('close', (code) => {
        t.equal(code, 1000)
      })
    })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.addEventListener('open', () => ws.close(1000))
  })

  t.test('Close with code and reason', (t) => {
    t.plan(2)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('close', (code, reason) => {
        t.equal(code, 1000)
        t.same(reason, Buffer.from('Goodbye'))
      })
    })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.addEventListener('open', () => ws.close(1000, 'Goodbye'))
  })

  t.test('Close with invalid code', (t) => {
    t.plan(2)

    const server = new WebSocketServer({ port: 0 })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.addEventListener('open', () => {
      t.throws(
        () => ws.close(2999),
        {
          name: 'InvalidAccessError',
          constructor: DOMException
        }
      )

      t.throws(
        () => ws.close(5000),
        {
          name: 'InvalidAccessError',
          constructor: DOMException
        }
      )

      ws.close()
    })
  })

  t.test('Close with invalid reason', (t) => {
    t.plan(1)

    const server = new WebSocketServer({ port: 0 })

    t.teardown(server.close.bind(server))
    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    ws.addEventListener('open', () => {
      t.throws(
        () => ws.close(1000, 'a'.repeat(124)),
        {
          name: 'SyntaxError',
          constructor: DOMException
        }
      )

      ws.close(1000)
    })
  })

  t.test('Close with no code or reason', (t) => {
    t.plan(2)

    const server = new WebSocketServer({ port: 0 })

    server.on('connection', (ws) => {
      ws.on('close', (code, reason) => {
        t.equal(code, 1005)
        t.same(reason, Buffer.alloc(0))
      })
    })

    t.teardown(server.close.bind(server))

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.addEventListener('open', () => ws.close())
  })
})
