'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, after } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

describe('Close', () => {
  test('Close with code', (t) => {
    return new Promise((resolve) => {
      const server = new WebSocketServer({ port: 0 })

      server.on('connection', (ws) => {
        ws.on('close', (code) => {
          t.assert.strictEqual(code, 1000)
          server.close()
          resolve()
        })
      })

      const ws = new WebSocket(`ws://localhost:${server.address().port}`)
      ws.addEventListener('open', () => ws.close(1000))
    })
  })

  test('Close with code and reason', (t) => {
    return new Promise((resolve) => {
      const server = new WebSocketServer({ port: 0 })

      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          t.assert.strictEqual(code, 1000)
          t.assert.deepStrictEqual(reason, Buffer.from('Goodbye'))
          server.close()
          resolve()
        })
      })

      const ws = new WebSocket(`ws://localhost:${server.address().port}`)
      ws.addEventListener('open', () => ws.close(1000, 'Goodbye'))
    })
  })

  test('Close with invalid code', (t) => {
    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    return new Promise((resolve) => {
      ws.addEventListener('open', () => {
        t.assert.throws(
          () => ws.close(2999),
          {
            name: 'InvalidAccessError',
            constructor: DOMException
          }
        )

        t.assert.throws(
          () => ws.close(5000),
          {
            name: 'InvalidAccessError',
            constructor: DOMException
          }
        )

        ws.close()
        server.close()
        resolve()
      })
    })
  })

  test('Close with invalid reason', (t) => {
    const server = new WebSocketServer({ port: 0 })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)

    return new Promise((resolve) => {
      ws.addEventListener('open', () => {
        t.assert.throws(
          () => ws.close(1000, 'a'.repeat(124)),
          {
            name: 'SyntaxError',
            constructor: DOMException
          }
        )

        ws.close(1000)
        server.close()
        resolve()
      })
    })
  })

  test('Close with no code or reason', (t) => {
    const server = new WebSocketServer({ port: 0 })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          t.assert.strictEqual(code, 1005)
          t.assert.deepStrictEqual(reason, Buffer.alloc(0))
          server.close()
          resolve()
        })
      })

      const ws = new WebSocket(`ws://localhost:${server.address().port}`)
      ws.addEventListener('open', () => ws.close())
    })
  })

  test('Close with a 3000 status code', (t) => {
    const server = new WebSocketServer({ port: 0 })

    return new Promise((resolve) => {
      server.on('connection', (ws) => {
        ws.on('close', (code, reason) => {
          t.assert.strictEqual(code, 3000)
          t.assert.deepStrictEqual(reason, Buffer.alloc(0))
          server.close()
          resolve()
        })
      })

      const ws = new WebSocket(`ws://localhost:${server.address().port}`)
      ws.addEventListener('open', () => ws.close(3000))
    })
  })

  test('calling close twice will only trigger the close event once', async (t) => {
    t = tspl(t, { plan: 1 })

    const server = new WebSocketServer({ port: 0 })

    after(() => server.close())

    server.on('connection', (ws) => {
      ws.on('close', (code) => {
        t.strictEqual(code, 1000)
      })
    })

    const ws = new WebSocket(`ws://localhost:${server.address().port}`)
    ws.addEventListener('open', () => {
      ws.close(1000)
      ws.close(1000)
    })

    await t.completed
  })
})
