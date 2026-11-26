'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http2')
const { once } = require('node:events')
const { setTimeout: sleep } = require('node:timers/promises')
const { Agent } = require('..')

test('closing dispatcher after one multiplexed stream failed pre-response does not crash', async (t) => {
  const server = createServer()
  server.on('stream', async (stream, headers) => {
    if (headers[':path'] === '/slow') {
      await sleep(50)
      stream.respond({ ':status': 200 })
      stream.end('slow')
    } else {
      stream.close()
    }
  })
  server.listen(0)
  await once(server, 'listening')
  const origin = `http://localhost:${server.address().port}`
  const dispatcher = new Agent({ connections: 1, useH2c: true })
  t.after(async () => {
    await dispatcher.destroy()
    await new Promise((resolve) => server.close(resolve))
  })

  const slow = dispatcher
    .request({ origin, path: '/slow', method: 'GET' })
    .then((res) => res.body.text())

  await assert.rejects(
    dispatcher.request({ origin, path: '/bad', method: 'GET' }),
    (err) => err.code === 'UND_ERR_INFO' || err.code === 'ERR_HTTP2_STREAM_ABORTED'
  )

  assert.strictEqual(await slow, 'slow')

  await dispatcher.close()
})
