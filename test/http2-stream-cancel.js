'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { constants, createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

// RST_STREAM(CANCEL) received before the response is the one reset code Node
// reports as a bare 'close' on the client stream: no 'end' (unlike NO_ERROR)
// and no 'error' (unlike PROTOCOL_ERROR / INTERNAL_ERROR / REFUSED_STREAM).
// Destroying the stream also unenrolls its timeout, so no 'timeout' follows.
//
// The client completed a request only from 'end', 'error' or 'timeout', so a
// cancelled stream left the request in the running window forever and its
// caller never heard back. Proxies send this upstream whenever their own
// downstream client goes away.
test('a stream cancelled before the response settles the request', async t => {
  t = tspl(t, { plan: 1 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    setTimeout(() => {
      try {
        stream.close(constants.NGHTTP2_CANCEL)
      } catch {}
    }, 30)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    // Long enough that only a real completion can settle this in time.
    headersTimeout: 30000,
    bodyTimeout: 30000
  })
  after(() => client.destroy())

  await t.rejects(client.request({ path: '/', method: 'GET' }), {
    code: 'UND_ERR_INFO'
  })

  await t.completed
})

test('a stream cancelled after the response headers still completes', async t => {
  t = tspl(t, { plan: 2 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream) => {
    stream.on('error', () => {})
    stream.respond({ ':status': 200 })
    setTimeout(() => {
      try {
        stream.close(constants.NGHTTP2_CANCEL)
      } catch {}
    }, 30)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: { rejectUnauthorized: false },
    allowH2: true,
    headersTimeout: 30000,
    bodyTimeout: 30000
  })
  after(() => client.destroy())

  const res = await client.request({ path: '/', method: 'GET' })
  t.strictEqual(res.statusCode, 200)
  t.strictEqual(await res.body.text(), '')

  await t.completed
})
