'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const zlib = require('node:zlib')
const { decompressStream } = require('../lib/core/util')

test('returns the stream as-is given no content encoding', async () => {
  const input = new Response('hello world')
  const stream = decompressStream(input.body)
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('returns the stream as-is given empty content encoding string', async () => {
  const input = new Response('hello world')
  const stream = decompressStream(input.body, '')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('returns the stream as-is given no known encodings', async () => {
  const input = new Response('hello world')
  const stream = decompressStream(input.body, 'x-unknown-encoding')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('decompresses the stream with "gzip" compression', async () => {
  const input = new Response(zlib.gzipSync('hello world'))
  const stream = decompressStream(input.body, 'gzip')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('decompresses the stream with "x-gzip" compression', async () => {
  const input = new Response(zlib.gzipSync('hello world'))
  const stream = decompressStream(input.body, 'x-gzip')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('decompresses the stream with "gzip, br" compression', async () => {
  const input = new Response(
    zlib.brotliCompressSync(zlib.gzipSync('hello world'))
  )
  const stream = decompressStream(input.body, 'gzip, br')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('decompresses the stream with "deflate" compression', async () => {
  const input = new Response(zlib.deflateSync('hello world'))
  const stream = decompressStream(input.body, 'deflate')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})

test('decompresses the stream with "deflate, gzip" compression', async () => {
  const input = new Response(zlib.gzipSync(zlib.deflateSync('hello world')))
  const stream = decompressStream(input.body, 'deflate, gzip')
  assert.strictEqual(await new Response(stream).text(), 'hello world')
})
