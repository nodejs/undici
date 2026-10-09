'use strict'

const { describe, test } = require('node:test')
const { Response, Request } = require('../../')

// https://github.com/nodejs/undici/issues/2164
describe('body mixin source shortcut', () => {
  describe('string source', () => {
    test('Response.text() works with string body', async (t) => {
      const res = new Response('hello world')
      t.assert.strictEqual(await res.text(), 'hello world')
    })

    test('Response.json() works with string body', async (t) => {
      const res = new Response('{"key":"value"}')
      t.assert.deepStrictEqual(await res.json(), { key: 'value' })
    })

    test('Response.arrayBuffer() works with string body', async (t) => {
      const res = new Response('abc')
      const ab = await res.arrayBuffer()
      t.assert.ok(ab instanceof ArrayBuffer)
      t.assert.strictEqual(new TextDecoder().decode(ab), 'abc')
    })

    test('Response.blob() works with string body', async (t) => {
      const res = new Response('hello')
      const blob = await res.blob()
      t.assert.strictEqual(await blob.text(), 'hello')
    })

    test('Response.bytes() works with string body', async (t) => {
      const res = new Response('xyz')
      const bytes = await res.bytes()
      t.assert.ok(bytes instanceof Uint8Array)
      t.assert.strictEqual(new TextDecoder().decode(bytes), 'xyz')
    })

    test('Request.text() works with string body', async (t) => {
      const req = new Request('http://localhost', { method: 'POST', body: 'test' })
      t.assert.strictEqual(await req.text(), 'test')
    })

    test('string body with multibyte characters', async (t) => {
      const input = '日本語テスト 🚀'
      const res = new Response(input)
      t.assert.strictEqual(await res.text(), input)
    })

    test('empty string body', async (t) => {
      const res = new Response('')
      t.assert.strictEqual(await res.text(), '')
    })
  })

  describe('Uint8Array source', () => {
    test('Response.text() works with Uint8Array body', async (t) => {
      const res = new Response(new TextEncoder().encode('binary test'))
      t.assert.strictEqual(await res.text(), 'binary test')
    })

    test('Response.arrayBuffer() works with Uint8Array body', async (t) => {
      const input = new Uint8Array([1, 2, 3, 4])
      const res = new Response(input)
      const ab = await res.arrayBuffer()
      t.assert.deepStrictEqual(new Uint8Array(ab), new Uint8Array([1, 2, 3, 4]))
    })

    test('Response.bytes() works with Uint8Array body', async (t) => {
      const input = new Uint8Array([10, 20, 30])
      const res = new Response(input)
      const bytes = await res.bytes()
      t.assert.deepStrictEqual(bytes, new Uint8Array([10, 20, 30]))
    })

    test('Response.blob() works with Uint8Array body', async (t) => {
      const input = new Uint8Array([65, 66, 67]) // ABC
      const res = new Response(input)
      const blob = await res.blob()
      t.assert.strictEqual(await blob.text(), 'ABC')
    })
  })

  describe('body is marked unusable after consumption', () => {
    test('string body cannot be read twice', async (t) => {
      const res = new Response('once')
      await res.text()
      await t.assert.rejects(res.text(), TypeError)
    })

    test('Uint8Array body cannot be read twice', async (t) => {
      const res = new Response(new Uint8Array([1, 2, 3]))
      await res.arrayBuffer()
      await t.assert.rejects(res.arrayBuffer(), TypeError)
    })

    test('bodyUsed is true after consuming string body', async (t) => {
      const res = new Response('used')
      t.assert.strictEqual(res.bodyUsed, false)
      await res.text()
      t.assert.strictEqual(res.bodyUsed, true)
    })

    test('bodyUsed is true after consuming Uint8Array body', async (t) => {
      const res = new Response(new Uint8Array([1]))
      t.assert.strictEqual(res.bodyUsed, false)
      await res.bytes()
      t.assert.strictEqual(res.bodyUsed, true)
    })
  })

  describe('non-shortcuttable sources still work', () => {
    test('ReadableStream body still works', async (t) => {
      const stream = new ReadableStream({
        start (controller) {
          controller.enqueue(new TextEncoder().encode('streamed'))
          controller.close()
        }
      })
      const res = new Response(stream)
      t.assert.strictEqual(await res.text(), 'streamed')
    })

    test('Blob body still works', async (t) => {
      const blob = new Blob(['blob content'])
      const res = new Response(blob)
      t.assert.strictEqual(await res.text(), 'blob content')
    })

    test('null body returns empty string', async (t) => {
      const res = new Response(null)
      t.assert.strictEqual(await res.text(), '')
    })
  })
})
