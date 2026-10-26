const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { WebSocket } = require('../..')

test('readyState should be CLOSED (3) when close event fires', async (t) => {
  const server = createServer()
  await new Promise((resolve) => server.listen(0, resolve))
  t.after(() => server.close())

  const ws = new WebSocket(`ws://localhost:${server.address().port}`)

  ws.addEventListener('close', () => {
    t.assert.strictEqual(ws.readyState, 3, `readyState should be CLOSED (3) inside close handler, got ${ws.readyState}`)
  })

  ws.close()

  await once(ws, 'close')

  t.assert.strictEqual(ws.readyState, 3, `readyState should be CLOSED (3) after close event, got ${ws.readyState}`)
})
