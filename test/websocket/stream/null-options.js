'use strict'

const { once } = require('node:events')
const { test } = require('node:test')
const { WebSocketServer } = require('ws')
const { WebSocketError, WebSocketStream } = require('../../..')

async function connectAndClose (t, options, closeInfo) {
  const server = new WebSocketServer({ port: 0 })
  t.after(() => {
    for (const client of server.clients) client.terminate()
    server.close()
  })
  await once(server, 'listening')

  const stream = new WebSocketStream(`ws://localhost:${server.address().port}`, options)
  // Observe a rejection if the socket is terminated by test cleanup.
  const closed = Promise.allSettled([stream.closed])
  await stream.opened
  stream.close(closeInfo)
  t.assert.deepStrictEqual(await closed, [
    { status: 'fulfilled', value: { closeCode: 1005, reason: '' } }
  ])
}

test('WebSocketStream accepts null constructor options', { timeout: 5000 }, async (t) => {
  await connectAndClose(t, null, undefined)
})

test('WebSocketStream.close accepts null close info', { timeout: 5000 }, async (t) => {
  await connectAndClose(t, undefined, null)
})

test('WebSocketError accepts null close info', (t) => {
  const error = new WebSocketError('socket closed', null)
  t.assert.strictEqual(error.message, 'socket closed')
  t.assert.strictEqual(error.closeCode, null)
  t.assert.strictEqual(error.reason, '')
})
