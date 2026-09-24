'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { once } = require('node:events')
const { createSecureServer } = require('node:http2')
const pem = require('@metcoder95/https-pem')
const { Agent, Dispatcher1Wrapper } = require('..')

for (const allowH2 of [false, true]) {
  test(`legacy headers and trailers are raw arrays (allowH2: ${allowH2})`, async t => {
    const server = createSecureServer({ ...await pem.generate({ opts: { keySize: 2048 } }), allowHTTP1: true })
    const dispatcher = new Agent({ allowH2, connect: { rejectUnauthorized: false } })
    t.after(async () => {
      await dispatcher.destroy()
      await new Promise(resolve => server.close(resolve))
    })

    let protocol
    server.on('request', (request, response) => {
      protocol = request.httpVersion
      response.writeHead(200, { 'x-test-header': 'caf\u00e9', 'set-cookie': ['a=1', 'b=2'] })
      response.write('ok')
      response.addTrailers({ 'x-test-trailer': 'caf\u00e9' })
      response.end()
    })
    server.listen(0)
    await once(server, 'listening')

    const result = await new Promise((resolve, reject) => {
      let headers
      const chunks = []
      dispatcher.dispatch({ origin: `https://localhost:${server.address().port}`, path: '/', method: 'GET' }, Dispatcher1Wrapper.wrapHandler({
        onConnect () {},
        onHeaders (statusCode, value) {
          assert.strictEqual(statusCode, 200)
          headers = value
          return true
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete (trailers) {
          resolve({ headers, trailers, body: Buffer.concat(chunks).toString() })
        },
        onError: reject
      }))
    })

    assert.strictEqual(protocol, allowH2 ? '2.0' : '1.1')
    assert.strictEqual(result.body, 'ok')
    assert.ok(Array.isArray(result.headers))
    assert.ok(result.headers.every(Buffer.isBuffer))
    const headers = result.headers.map(value => value.toString('latin1'))
    assert.strictEqual(headers[headers.indexOf('x-test-header') + 1], 'caf\u00e9')
    assert.deepStrictEqual(headers.filter((_, i) => headers[i - 1] === 'set-cookie'), ['a=1', 'b=2'])
    assert.ok(Array.isArray(result.trailers))
    assert.ok(result.trailers.every(Buffer.isBuffer))
    assert.deepStrictEqual(result.trailers.map(value => value.toString('latin1')), ['x-test-trailer', 'caf\u00e9'])
  })
}

test('legacy HTTP/2 CONNECT upgrade headers are raw arrays', async t => {
  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const dispatcher = new Agent({ connect: { rejectUnauthorized: false } })
  t.after(async () => {
    await dispatcher.destroy()
    await new Promise(resolve => server.close(resolve))
  })
  server.on('stream', (stream, headers) => {
    assert.strictEqual(headers[':method'], 'CONNECT')
    stream.respond({ ':status': 200, 'x-test-header': 'value' })
    stream.end()
  })
  server.listen(0)
  await once(server, 'listening')

  const headers = await new Promise((resolve, reject) => {
    dispatcher.dispatch({ origin: `https://localhost:${server.address().port}`, path: '/', method: 'CONNECT' }, Dispatcher1Wrapper.wrapHandler({
      onConnect () {},
      onUpgrade (statusCode, headers, socket) {
        assert.strictEqual(statusCode, 200)
        socket.on('error', reject)
        socket.on('end', () => resolve(headers))
        socket.resume()
        socket.end()
      },
      onError: reject
    }))
  })
  assert.ok(Array.isArray(headers))
  assert.ok(headers.every(Buffer.isBuffer))
  const values = headers.map(value => value.toString('latin1'))
  assert.strictEqual(values[values.indexOf('x-test-header') + 1], 'value')
})
