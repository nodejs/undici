'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')

const { WebSocketStream } = require('../../..')

// Repro for: opened.readable may include raw socket bytes instead of only message payloads.
test('websocketstream opened.readable should expose text message payloads only', async (t) => {
  const server = new WebSocketServer({
    port: 0,
    path: '/',
    perMessageDeflate: false
  })

  t.after(() => {
    for (const client of server.clients) {
      client.terminate()
    }

    server.close()
  })

  server.on('connection', (socket) => {
    socket.send(JSON.stringify({ event: 'Initialize', data: 1010 }))
    socket.send(JSON.stringify({ event: 'Ready', data: { id: 1010 } }))
  })

  const url = `ws://127.0.0.1:${server.address().port}/`

  for (let run = 1; run <= 100; run++) {
    const wss = new WebSocketStream(url)
    const { readable } = await wss.opened
    const reader = readable.getReader()

    try {
      for (let index = 1; index <= 2; index++) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        t.assert.strictEqual(
          typeof value,
          'string',
          `run ${run}, chunk ${index}: expected string payload but got ${value?.constructor?.name ?? typeof value}`
        )

        t.assert.doesNotThrow(
          () => JSON.parse(value),
          `run ${run}, chunk ${index}: expected valid JSON text payload`
        )
      }
    } finally {
      reader.releaseLock()
      wss.close()
      await wss.closed.catch(() => {})
    }
  }
})
