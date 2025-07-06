'use strict'

const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocketStream } = require('../../..')

// https://github.com/ricea/websocketstream-explainer/issues/25
test('ReadableStream is closed properly', async (t) => {
  const server = new WebSocketServer({ port: 0 })

  const wss = new WebSocketStream(`ws://localhost:${server.address().port}`)

  t.after(() => server.close())

  const { readable, writable } = await wss.opened

  const writer = writable.getWriter()
  const reader = readable.getReader()

  await writer.close()
  await writer.closed

  await Promise.allSettled([reader.closed, writer.closed])
})
