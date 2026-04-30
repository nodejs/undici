'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')

const { WebSocketStream } = require('../../..')

test('WebSocketStream does not throw when readable is canceled before a clean close', async (t) => {
  let uncaughtException = null

  const uncaughtExceptionHandler = (err) => {
    uncaughtException = err
  }

  process.on('uncaughtException', uncaughtExceptionHandler)

  const server = new WebSocketServer({ port: 0 })

  server.on('connection', (ws) => {
    setTimeout(() => {
      ws.send('hello')

      setTimeout(() => {
        ws.close(1000, 'bye')
      }, 20)
    }, 200)
  })

  t.after(() => {
    process.off('uncaughtException', uncaughtExceptionHandler)

    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  const wss = new WebSocketStream(`ws://127.0.0.1:${server.address().port}`)
  const { readable } = await wss.opened

  await readable.cancel(new Error('client cancel')).catch(() => {})
  wss.close()

  await Promise.race([
    wss.closed.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 1000))
  ])

  t.assert.strictEqual(uncaughtException, null)
})
