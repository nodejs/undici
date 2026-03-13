'use strict'

const { describe, it, before, after } = require('node:test')
const stream = require('node:stream')
const { Response } = require('../../index.js')
const TestServer = require('./utils/server.js')

describe('Response', () => {
  const local = new TestServer()

  before(async () => {
    await local.start()
  })

  after(async () => {
    return local.stop()
  })

  it('should have attributes conforming to Web IDL', (t) => {
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
      t.assert.ok(enumerableProperties.includes(toCheck))
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
      t.assert.throws(() => {
        res[toCheck] = 'abc'
      }, new TypeError(`Cannot set property ${toCheck} of #<Response> which has only a getter`))
    }
  })

  it('should support empty options', async (t) => {
    const res = new Response(stream.Readable.from('a=1'))
    const result = await res.text()
    t.assert.strictEqual(result, 'a=1')
  })

  it('should support parsing headers', (t) => {
    const res = new Response(null, {
      headers: {
        a: '1'
      }
    })
    t.assert.strictEqual(res.headers.get('a'), '1')
  })

  it('should support text() method', async (t) => {
    const res = new Response('a=1')
    const result = await res.text()
    t.assert.strictEqual(result, 'a=1')
  })

  it('should support json() method', async (t) => {
    const res = new Response('{"a":1}')
    const result = await res.json()
    t.assert.deepStrictEqual(result, { a: 1 })
  })

  if (Blob) {
    it('should support blob() method', async (t) => {
      const res = new Response('a=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        }
      })
      const result = await res.blob()
      t.assert.ok(result instanceof Blob)
      t.assert.strictEqual(result.size, 3)
      t.assert.strictEqual(result.type, 'text/plain')
    })
  }

  it('should support clone() method', (t) => {
    const body = stream.Readable.from('a=1')
    const res = new Response(body, {
      headers: {
        a: '1'
      },
      status: 346,
      statusText: 'production'
    })
    const cl = res.clone()
    t.assert.strictEqual(cl.headers.get('a'), '1')
    t.assert.strictEqual(cl.type, 'default')
    t.assert.strictEqual(cl.status, 346)
    t.assert.strictEqual(cl.statusText, 'production')
    t.assert.strictEqual(cl.ok, false)
    // Clone body shouldn't be the same body
    t.assert.notStrictEqual(cl.body, body)
    return Promise.all([cl.text(), res.text()]).then(results => {
      t.assert.strictEqual(results[0], 'a=1')
      t.assert.strictEqual(results[1], 'a=1')
    })
  })

  it('should support stream as body', async (t) => {
    const body = stream.Readable.from('a=1')
    const res = new Response(body)
    const result = await res.text()

    t.assert.strictEqual(result, 'a=1')
  })

  it('should support string as body', async (t) => {
    const res = new Response('a=1')
    const result = await res.text()

    t.assert.strictEqual(result, 'a=1')
  })

  it('should support buffer as body', async (t) => {
    const res = new Response(Buffer.from('a=1'))
    const result = await res.text()

    t.assert.strictEqual(result, 'a=1')
  })

  it('should support ArrayBuffer as body', async (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const res = new Response(fullbuffer)
    new Uint8Array(fullbuffer)[0] = 0

    const result = await res.text()
    t.assert.strictEqual(result, 'a=12345678901234')
  })

  it('should support blob as body', async (t) => {
    const res = new Response(new Blob(['a=1']))
    const result = await res.text()

    t.assert.strictEqual(result, 'a=1')
  })

  it('should support Uint8Array as body', async (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0

    const result = await res.text()
    t.assert.strictEqual(result, '123456789')
  })

  it('should support BigUint64Array as body', async (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new BigUint64Array(fullbuffer, 8, 1)
    const res = new Response(body)
    body[0] = 0n

    const result = await res.text()
    t.assert.strictEqual(result, '78901234')
  })

  it('should support DataView as body', async (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0

    const result = await res.text()
    t.assert.strictEqual(result, '123456789')
  })

  it('should default to null as body', (t) => {
    const res = new Response()
    t.assert.strictEqual(res.body, null)

    return res.text().then(result => t.assert.strictEqual(result, ''))
  })

  it('should default to 200 as status code', (t) => {
    const res = new Response(null)
    t.assert.strictEqual(res.status, 200)
  })

  it('should default to empty string as url', (t) => {
    const res = new Response()
    t.assert.strictEqual(res.url, '')
  })

  it('should support error() static method', (t) => {
    const res = Response.error()
    t.assert.ok(res instanceof Response)
    t.assert.strictEqual(res.status, 0)
    t.assert.strictEqual(res.statusText, '')
    t.assert.strictEqual(res.type, 'error')
  })

  it('should support undefined status', (t) => {
    const res = new Response(null, { status: undefined })
    t.assert.strictEqual(res.status, 200)
  })

  it('should support undefined statusText', (t) => {
    const res = new Response(null, { statusText: undefined })
    t.assert.strictEqual(res.statusText, '')
  })

  it('should not set bodyUsed to undefined', (t) => {
    const res = new Response()
    t.assert.strictEqual(res.bodyUsed, false)
  })
})
