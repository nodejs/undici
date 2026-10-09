'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http2')
const { once } = require('node:events')
const { Client } = require('..')
const { kHTTP2Session } = require('../lib/core/symbols')

async function setup (t) {
  const server = createServer()
  server.on('stream', (stream, headers) => {
    stream.on('error', () => {})
    if (headers[':path'] !== '/retained') {
      stream.respond({ ':status': 200 })
      stream.end('ok')
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  const client = new Client(`http://127.0.0.1:${server.address().port}`, {
    useH2c: true,
    keepAliveTimeout: 50
  })
  t.after(async () => {
    await client.destroy()
    await new Promise(resolve => server.close(resolve))
  })
  return client
}

test('HTTP/2 idle timeout retains its disconnect reason and permits reconnection', { timeout: 5000 }, async (t) => {
  const client = await setup(t)
  const disconnected = once(client, 'disconnect')
  const response = await client.request({ path: '/', method: 'GET' })
  t.assert.strictEqual(await response.body.text(), 'ok')

  const [, , error] = await disconnected
  t.assert.strictEqual(error.code, 'UND_ERR_INFO')
  t.assert.strictEqual(error.message, 'socket idle timeout')

  const next = await client.request({ path: '/', method: 'GET' })
  t.assert.strictEqual(await next.body.text(), 'ok')
})

test('HTTP/2 idle timeout does not propagate an error to a stream still tracked by Node', { timeout: 5000 }, async (t) => {
  const client = await setup(t)
  const response = await client.request({ path: '/', method: 'GET' })
  t.assert.strictEqual(await response.body.text(), 'ok')

  // Model the state reported in #5936: Undici has completed its request, but
  // Node still tracks a native stream. Creating it directly makes this
  // discrepancy deterministic without claiming to reproduce its origin.
  const stream = client[kHTTP2Session].request({ ':path': '/retained' })
  const errors = []
  stream.on('error', error => errors.push(error))
  const closed = new Promise(resolve => stream.once('close', resolve))

  await closed
  t.assert.deepStrictEqual(errors, [])
})
