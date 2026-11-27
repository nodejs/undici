'use strict'

const { test } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('HTTP/2 requests reject when the server closes a stream before responding', { timeout: 10_000 }, async (t) => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.destroy()
  })

  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  t.after(async () => {
    await client.destroy()
    await new Promise((resolve) => server.close(resolve))
  })

  for (let i = 0; i < 2; i++) {
    await t.assert.rejects(client.request({ path: '/', method: 'GET' }), (err) => {
      // Newer Node.js versions surface the premature reset as a stream error.
      return err.code === 'ERR_HTTP2_STREAM_ABORTED' ||
        (err.code === 'UND_ERR_INFO' && err.message === 'HTTP/2: stream half-closed (remote)')
    })
  }
})
