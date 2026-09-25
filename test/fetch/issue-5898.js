'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createServer: createHTTP1Server } = require('node:http')
const { createSecureServer: createHTTP2Server } = require('node:http2')
const pem = require('@metcoder95/https-pem')
const { once } = require('node:events')
const { brotliCompressSync, gzipSync } = require('node:zlib')
const { Client, fetch, interceptors } = require('../..')

const plain = 'some plain text'
const compressed = brotliCompressSync(gzipSync(plain))

for (const [protocol, createServer, options] of [
  ['HTTP/1.1', createHTTP1Server, { allowH2: false }],
  ['HTTP/2', async () => createHTTP2Server({ ...await pem.generate({ opts: { keySize: 2048 } }), strictSingleValueFields: false }), { allowH2: true, connect: { rejectUnauthorized: false } }]
]) {
  test(`repeated response headers over ${protocol}`, async (t) => {
    const server = await createServer()
    let supportsRepeatedSingleValueFields = true
    function writeRepeatedHeaders (res, status, name, values) {
      try {
        res.writeHead(status, { [name]: values })
      } catch (err) {
        // Older Node HTTP/2 servers reject these arrays even with
        // strictSingleValueFields: false. Keep testing the combined form.
        if (protocol !== 'HTTP/2' || err.code !== 'ERR_HTTP2_HEADER_SINGLE_VALUE') {
          throw err
        }
        supportsRepeatedSingleValueFields = false
        res.writeHead(status, { [name]: values.join(', ') })
      }
    }
    server.on('request', (req, res) => {
      switch (req.url) {
        case '/encoding':
          writeRepeatedHeaders(res, 200, 'content-encoding', ['gzip', 'br'])
          res.end(compressed)
          break
        case '/type':
          writeRepeatedHeaders(res, 200, 'content-type', ['text/plain', 'invalid', 'text/html'])
          res.end(plain)
          break
        case '/location':
          writeRepeatedHeaders(res, 302, 'location', ['/A', '/B'])
          res.end()
          break
        case '/single-location':
          res.writeHead(302, { location: '/A' })
          res.end()
          break
        case '/headers':
          res.writeHead(200, { 'strict-transport-security': ['max-age=100', 'max-age=200'], 'x-repeated': ['first', 'second'] })
          res.end(plain)
          break
        default:
          res.end(req.url)
      }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const origin = `${protocol === 'HTTP/2' ? 'https' : 'http'}://127.0.0.1:${server.address().port}`
    const client = new Client(origin, options)
    t.after(async () => {
      await client.destroy()
      await new Promise(resolve => server.close(resolve))
    })

    const encoding = await fetch(`${origin}/encoding`, { dispatcher: client })
    assert.equal(await encoding.text(), plain)
    assert.equal(encoding.headers.get('content-encoding'), 'gzip, br')

    const type = await fetch(`${origin}/type`, { dispatcher: client })
    assert.equal((await type.blob()).type, 'text/html')
    assert.equal(type.headers.get('content-type'), 'text/plain, invalid, text/html')

    const manual = await fetch(`${origin}/location`, { dispatcher: client, redirect: 'manual' })
    if (supportsRepeatedSingleValueFields) {
      await assert.rejects(fetch(`${origin}/location`, { dispatcher: client }), TypeError)
    }
    assert.equal(manual.headers.get('location'), '/A, /B')
    await manual.body?.cancel()
    assert.equal(await (await fetch(`${origin}/single-location`, { dispatcher: client })).text(), '/A')

    const response = await client.request({ origin, path: '/headers', method: 'GET', responseHeaders: 'raw' })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.headers.slice(response.headers.indexOf('strict-transport-security'), response.headers.indexOf('strict-transport-security') + 4), [
      'strict-transport-security', 'max-age=100', 'strict-transport-security', 'max-age=200'
    ])
    assert.equal(response.headers.includes(':status'), false)
    await response.body.dump()

    const encoded = await client.request({ origin, path: '/encoding', method: 'GET' })
    assert.deepEqual(encoded.headers['content-encoding'], supportsRepeatedSingleValueFields ? ['gzip', 'br'] : 'gzip, br')
    await encoded.body.dump()

    const headers = await fetch(`${origin}/headers`, { dispatcher: client })
    assert.equal(headers.headers.get('strict-transport-security'), 'max-age=100, max-age=200')
    assert.equal(headers.headers.get('x-repeated'), 'first, second')
    await headers.body?.cancel()

    if (protocol === 'HTTP/2') {
      const retried = await fetch(`${origin}/headers`, { dispatcher: client.compose(interceptors.retry()) })
      assert.equal(retried.headers.get('x-repeated'), 'first, second')
      await retried.body?.cancel()
    }
  })
}
