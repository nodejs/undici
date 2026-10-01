'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer } = require('node:net')
const { once } = require('node:events')
const { setImmediate } = require('node:timers/promises')
const { Client } = require('..')

test('llhttp builds mutable maps for fragmented headers, informational responses and trailers', { timeout: 5000 }, async (t) => {
  const server = createServer(socket => {
    socket.once('data', async () => {
      for (const chunk of [
        'HTTP/1.1 103 Early Hints\r\nLi',
        'nk: </asset>; rel=preload\r\n\r\nHTTP/1.1 200 OK\r\nContent-T',
        'ype: TEXT/PLAIN\r\nX-Dupe: First\r\nx-dupe: Second\r\nX-Empty:',
        '\r\n__proto__: First\r\n__proto__: Second\r\nConstructor: Literal\r\nTransfer-Encoding: chunked\r\n\r\n',
        '1\r\nx\r\n0\r\nX-Trai',
        'ler: LAST\r\nX-Trailer: AGAIN\r\n\r\n'
      ]) {
        socket.write(chunk)
        await setImmediate()
      }
    })
  })
  t.after(() => server.close())
  server.listen(0)
  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 2000, useMilo: false })
  t.after(() => client.destroy())
  const starts = []
  await new Promise((resolve, reject) => {
    client.dispatch({ path: '/', method: 'GET' }, {
      onRequestStart () {},
      onResponseStart (controller, status, headers) {
        assert.strictEqual(controller.rawHeaders, headers)
        assert.equal(Array.isArray(headers), false)
        starts.push([status, headers])
        headers['x-handler-added'] = 'mutable'
      },
      onResponseData () {},
      onResponseEnd (controller, trailers) {
        assert.strictEqual(controller.rawTrailers, trailers)
        assert.deepEqual(trailers, { 'x-trailer': ['LAST', 'AGAIN'] })
        resolve()
      },
      onResponseError (_controller, error) { reject(error) }
    })
  })
  assert.equal(starts.length, 2)
  assert.equal(starts[0][0], 103)
  assert.equal(starts[0][1].link, '</asset>; rel=preload')
  const headers = starts[1][1]
  assert.equal(headers['content-type'], 'TEXT/PLAIN')
  assert.deepEqual(headers['x-dupe'], ['First', 'Second'])
  assert.equal(headers['x-empty'], '')
  assert.deepEqual(Object.getOwnPropertyDescriptor(headers, '__proto__').value, ['First', 'Second'])
  assert.strictEqual(Object.getPrototypeOf(headers), Object.prototype)
  assert.equal(headers.constructor, 'Literal')
})

test('HTTP/1 map responses preserve Latin-1, duplicates and trailers', { timeout: 5000 }, async (t) => {
  const server = createServer(socket => {
    socket.once('data', () => socket.write(Buffer.from(
      'HTTP/1.1 200 OK\r\nX-Latin: éÿ\r\nX-Dup: One\r\nx-dup: Two\r\nTransfer-Encoding: chunked\r\n\r\n1\r\nx\r\n0\r\nX-Trailer: LAST\r\nX-Trailer: AGAIN\r\n\r\n', 'latin1')))
  })
  t.after(() => server.close())
  server.listen(0)
  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, { headersTimeout: 2000 })
  t.after(() => client.destroy())
  const response = await client.request({ path: '/', method: 'GET', responseHeaders: 'raw' })
  assert.deepEqual(response.headers, ['x-latin', 'éÿ', 'x-dup', 'One', 'x-dup', 'Two', 'transfer-encoding', 'chunked'])
  assert.equal(await response.body.text(), 'x')
  assert.deepEqual(response.trailers, { 'x-trailer': ['LAST', 'AGAIN'] })
})
