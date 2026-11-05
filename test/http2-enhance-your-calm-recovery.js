'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Client } = require('..')

test('ENHANCE_YOUR_CALM retires the session and reconnects', { timeout: 10000 }, async (t) => {
  const server = createServer()
  let sessions = 0

  server.on('session', session => {
    sessions++
    session.on('error', () => {})
  })

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    if (headers[':path'] === '/reset') {
      stream.close(constants.NGHTTP2_ENHANCE_YOUR_CALM)
    } else {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const client = new Client(`http://127.0.0.1:${server.address().port}`, { useH2c: true })
  t.after(async () => {
    await client.destroy()
    await new Promise(resolve => server.close(resolve))
  })

  const first = await client.request({ path: '/ok', method: 'GET' })
  assert.equal(await first.body.text(), 'ok')
  assert.equal(sessions, 1)

  await assert.rejects(
    client.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  const second = await client.request({ path: '/ok', method: 'GET' })
  assert.equal(await second.body.text(), 'ok')
  assert.equal(sessions, 2)
})
