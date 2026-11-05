'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer, constants } = require('node:http2')
const { once } = require('node:events')
const { Client } = require('..')

test('INTERNAL_ERROR on one stream must not kill another', { timeout: 10000 }, async (t) => {
  const server = createServer()
  let sessions = 0
  let release
  const gate = new Promise(resolve => { release = resolve })

  server.on('session', session => {
    sessions++
    session.on('error', () => {})
  })

  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})

    if (headers[':path'] === '/slow') {
      stream.respond({ ':status': 200 })
      gate.then(() => {
        if (!stream.destroyed) stream.end('healthy')
      })
    } else {
      stream.close(constants.NGHTTP2_INTERNAL_ERROR)
    }
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const client = new Client(
    `http://127.0.0.1:${server.address().port}`,
    { useH2c: true }
  )

  t.after(async () => {
    release()
    await client.destroy()
    await new Promise(resolve => server.close(resolve))
  })

  const slow = await client.request({
    path: '/slow',
    method: 'GET'
  })

  await assert.rejects(
    client.request({ path: '/reset', method: 'GET' }),
    { code: 'ERR_HTTP2_STREAM_ERROR' }
  )

  release()

  assert.equal(await slow.body.text(), 'healthy')
  assert.equal(sessions, 1)
})
