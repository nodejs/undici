'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const zlib = require('node:zlib')
const { decompress } = require('../lib/web/fetch/decompress')

const url = 'http://localhost/'

test('ignores responses with null body', () => {
  const body = decompress(new Request(url), new Response(null))
  assert.equal(body, null)
})

test('ignores responses without the "Content-Encoding" header', async () => {
  const body = decompress(new Request(url), new Response('hello world'))
  assert.equal(await new Response(body).text(), 'hello world')
})

test('ignores responses with empty "Content-Encoding" header', async () => {
  const body = decompress(
    new Request(url),
    new Response('hello world', {
      headers: { 'content-encoding': '' }
    })
  )
  assert.equal(await new Response(body).text(), 'hello world')
})

test('ignores redirect responses', async () => {
  const body = decompress(
    new Request(url, { redirect: 'follow' }),
    new Response('hello world', {
      status: 301,
      headers: {
        'content-encoding': 'gzip',
        location: '/next-url'
      }
    })
  )
  assert.equal(await new Response(body).text(), 'hello world')
})

test('ignores HEAD requests', async () => {
  const body = decompress(
    new Request(url, { method: 'HEAD' }),
    new Response('hello world', {
      headers: {
        'content-encoding': 'gzip'
      }
    })
  )
  assert.equal(await new Response(body).text(), 'hello world')
})

/**
 * @note Undici does not support the "CONNECT" request method.
 */
test.skip('ignores CONNECT requests', async () => {
  const body = decompress(
    new Request(url, { method: 'CONNECT' }),
    new Response('hello world', {
      headers: {
        'content-encoding': 'gzip'
      }
    })
  )
  assert.equal(await new Response(body).text(), 'hello world')
})

test('ignores responses with unsupported encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response('hello world', {
      headers: {
        'content-encoding': 'x-custom-encoding'
      }
    })
  )
  assert.equal(await new Response(body).text(), 'hello world')
})

test('decompresses responses with "gzip" encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response(zlib.gzipSync('hello world'), {
      headers: {
        'content-encoding': 'gzip'
      }
    })
  )
  assert.deepStrictEqual(await new Response(body).text(), 'hello world')
})

test('decompresses responses with "x-gzip" encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response(zlib.gzipSync('hello world'), {
      headers: {
        'content-encoding': 'x-gzip'
      }
    })
  )
  assert.deepStrictEqual(await new Response(body).text(), 'hello world')
})

test('decompresses responses with "gzip, br" encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response(zlib.brotliCompressSync(zlib.gzipSync('hello world')), {
      headers: {
        'content-encoding': 'gzip, br'
      }
    })
  )
  assert.deepStrictEqual(await new Response(body).text(), 'hello world')
})

test('decompresses responses with "deflate" encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response(zlib.deflateSync('hello world'), {
      headers: {
        'content-encoding': 'deflate'
      }
    })
  )
  assert.deepStrictEqual(await new Response(body).text(), 'hello world')
})

test('decompresses responses with "deflate, gzip" encoding', async () => {
  const body = decompress(
    new Request(url),
    new Response(zlib.gzipSync(zlib.deflateSync('hello world')), {
      headers: {
        'content-encoding': 'deflate, gzip'
      }
    })
  )
  assert.deepStrictEqual(await new Response(body).text(), 'hello world')
})
