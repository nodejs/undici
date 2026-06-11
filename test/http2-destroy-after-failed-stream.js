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
  t.after(() => server.close())

  const origin = `http://localhost:${server.address().port}`
  const dispatcher = new Agent({ connections: 1, useH2c: true })

  const slow = dispatcher
    .request({ origin, path: '/slow', method: 'GET' })
    .then((res) => res.body.text())

  await assert.rejects(
    dispatcher.request({ origin, path: '/bad', method: 'GET' }),
    { name: 'InformationalError' }
  )

  assert.strictEqual(await slow, 'slow')

  await dispatcher.close()
})
