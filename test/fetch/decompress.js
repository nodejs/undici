'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const zlib = require('node:zlib')
const { decompress } = require('../../lib/web/fetch/decompress')

const url = 'http://localhost/'

test('ignores responses without the "Content-Encoding" header', () => {
  const body = decompress(new Request(url), new Response(null))
  assert.equal(body, null)
})

test('ignores responses with empty "Content-Encoding" header', () => {
  const body = decompress(
    new Request(url),
    new Response(null, {
      headers: { 'content-encoding': '' }
    })
  )
  assert.equal(body, null)
})

test('ignores redirect responses', () => {
  const body = decompress(
    new Request(url, { redirect: 'follow' }),
    new Response(null, {
      status: 301,
      headers: {
        'content-encoding': 'gzip',
        location: '/next-url'
      }
    })
  )
  assert.equal(body, null)
})

test('ignores HEAD requests', () => {
  const body = decompress(
    new Request(url, { method: 'HEAD' }),
    new Response(null, {
      headers: {
        'content-encoding': 'gzip'
      }
    })
  )
  assert.equal(body, null)
})

/**
 * @note Undici does not support the "CONNECT" request method.
 */
test.skip('ignores CONNECT requests', () => {
  const body = decompress(
    new Request(url, { method: 'CONNECT' }),
    new Response(null, {
      headers: {
        'content-encoding': 'gzip'
      }
    })
  )
  assert.equal(body, null)
})

test('ignores responses with unsupported encoding', () => {
  const body = decompress(
    new Request(url),
    new Response(null, {
      headers: {
        'content-encoding': 'x-custom-encoding'
      }
    })
  )
  assert.equal(body, null)
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
