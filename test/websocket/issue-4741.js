const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const assert = require('node:assert')
const { WebSocket } = require('../..')

test('error and close events should fire after close() returns, not during', async (t) => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, resolve))
  t.after(() => server.close())

  let closeReturned = false
  const events = []

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('error', () => {
    t.assert.strictEqual(closeReturned, true, 'error event fired before close() returned')
    events.push('error')
  })

  ws.addEventListener('close', () => {
    t.assert.strictEqual(closeReturned, true, 'close event fired before close() returned')
    events.push('close')
  })

  ws.close()
  closeReturned = true

  await once(ws, 'close')

  assert.deepStrictEqual(events, ['error', 'close'], `expected ['error', 'close'] but got ${JSON.stringify(events)}`)
})
