'use strict'

const assert = require('node:assert')
const { describe, it, before, after } = require('node:test')
const stream = require('node:stream')
const { Response } = require('../../index.js')
const TestServer = require('./utils/server.js')
const { Blob } = require('node:buffer')

describe('Response', () => {
  const local = new TestServer()

  before(async () => {
    await local.start()
  })

  after(async () => {
    return local.stop()
  })

  it('should have attributes conforming to Web IDL', () => {
    const res = new Response()
    const enumerableProperties = []
    for (const property in res) {
      enumerableProperties.push(property)
    }

    for (const toCheck of [
      'body',
      'bodyUsed',
      'arrayBuffer',
      'blob',
      'json',
      'text',
      'type',
      'url',
      'status',
      'ok',
      'redirected',
      'statusText',
      'headers',
      'clone'
    ]) {
      assert.ok(enumerableProperties.includes(toCheck))
    }

    for (const toCheck of [
      'body',
      'bodyUsed',
      'type',
      'url',
      'status',
      'ok',
      'redirected',
      'statusText',
      'headers'
    ]) {
      assert.throws(() => {
        res[toCheck] = 'abc'
      }, new TypeError(`Cannot set property ${toCheck} of #<Response> which has only a getter`))
    }
  })

  it('should support empty options', async () => {
    const res = new Response(stream.Readable.from('a=1'))
    const result = await res.text()
    assert.strictEqual(result, 'a=1')
  })

  it('should support parsing headers', () => {
    const res = new Response(null, {
      headers: {
        a: '1'
      }
    })
    assert.strictEqual(res.headers.get('a'), '1')
  })

  it('should support text() method', async () => {
    const res = new Response('a=1')
    const result = await res.text()
    assert.strictEqual(result, 'a=1')
  })

  it('should support json() method', async () => {
    const res = new Response('{"a":1}')
    const result = await res.json()
    assert.deepStrictEqual(result, { a: 1 })
  })

  if (Blob) {
    it('should support blob() method', async () => {
      const res = new Response('a=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        }
      })
      const result = await res.blob()
      assert.ok(result instanceof Blob)
      assert.strictEqual(result.size, 3)
      assert.strictEqual(result.type, 'text/plain')
    })
  }

  it('should support clone() method', () => {
    const body = stream.Readable.from('a=1')
    const res = new Response(body, {
      headers: {
        a: '1'
      },
      status: 346,
      statusText: 'production'
    })
    const cl = res.clone()
    assert.strictEqual(cl.headers.get('a'), '1')
    assert.strictEqual(cl.type, 'default')
    assert.strictEqual(cl.status, 346)
    assert.strictEqual(cl.statusText, 'production')
    assert.strictEqual(cl.ok, false)
    // Clone body shouldn't be the same body
    assert.notStrictEqual(cl.body, body)
    return Promise.all([cl.text(), res.text()]).then(results => {
      assert.strictEqual(results[0], 'a=1')
      assert.strictEqual(results[1], 'a=1')
    })
  })

  it('should support stream as body', async () => {
    const body = stream.Readable.from('a=1')
    const res = new Response(body)
    const result = await res.text()

    assert.strictEqual(result, 'a=1')
  })

  it('should support string as body', async () => {
    const res = new Response('a=1')
    const result = await res.text()

    assert.strictEqual(result, 'a=1')
  })

  it('should support buffer as body', async () => {
    const res = new Response(Buffer.from('a=1'))
    const result = await res.text()

    assert.strictEqual(result, 'a=1')
  })

  it('should support ArrayBuffer as body', async () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const res = new Response(fullbuffer)
    new Uint8Array(fullbuffer)[0] = 0

    const result = await res.text()
    assert.strictEqual(result, 'a=12345678901234')
  })

  it('should support blob as body', async () => {
    const res = new Response(new Blob(['a=1']))
    const result = await res.text()

    assert.strictEqual(result, 'a=1')
  })

  it('should support Uint8Array as body', async () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0

    const result = await res.text()
    assert.strictEqual(result, '123456789')
  })

  it('should support BigUint64Array as body', async () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new BigUint64Array(fullbuffer, 8, 1)
    const res = new Response(body)
    body[0] = 0n

    const result = await res.text()
    assert.strictEqual(result, '78901234')
  })

  it('should support DataView as body', async () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0

    const result = await res.text()
    assert.strictEqual(result, '123456789')
  })

  it('should default to null as body', () => {
    const res = new Response()
    assert.strictEqual(res.body, null)

    return res.text().then(result => assert.strictEqual(result, ''))
  })

  it('should default to 200 as status code', () => {
    const res = new Response(null)
    assert.strictEqual(res.status, 200)
  })

  it('should default to empty string as url', () => {
    const res = new Response()
    assert.strictEqual(res.url, '')
  })

  it('should support error() static method', () => {
    const res = Response.error()
    assert.ok(res instanceof Response)
    assert.strictEqual(res.status, 0)
    assert.strictEqual(res.statusText, '')
    assert.strictEqual(res.type, 'error')
  })

  it('should support undefined status', () => {
    const res = new Response(null, { status: undefined })
    assert.strictEqual(res.status, 200)
  })

  it('should support undefined statusText', () => {
    const res = new Response(null, { statusText: undefined })
    assert.strictEqual(res.statusText, '')
  })

  it('should not set bodyUsed to undefined', () => {
    const res = new Response()
    assert.strictEqual(res.bodyUsed, false)
  })
})
