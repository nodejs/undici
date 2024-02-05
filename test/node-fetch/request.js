'use strict'

const assert = require('node:assert')
const { describe, it, before, after } = require('node:test')
const stream = require('node:stream')
const http = require('node:http')
const { Blob } = require('node:buffer')

const { Request } = require('../../index.js')
const TestServer = require('./utils/server.js')

describe('Request', () => {
  const local = new TestServer()
  let base

  before(async () => {
    await local.start()
    base = `http://${local.hostname}:${local.port}/`
  })

  after(async () => {
    return local.stop()
  })

  it('should have attributes conforming to Web IDL', () => {
    const request = new Request('http://github.com/')
    const enumerableProperties = []
    for (const property in request) {
      enumerableProperties.push(property)
    }

    for (const toCheck of [
      'body',
      'bodyUsed',
      'arrayBuffer',
      'blob',
      'json',
      'text',
      'method',
      'url',
      'headers',
      'redirect',
      'clone',
      'signal'
    ]) {
      assert.ok(enumerableProperties.includes(toCheck))
    }

    for (const toCheck of [
      'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal'
    ]) {
      assert.throws(() => {
        request[toCheck] = 'abc'
      }, new TypeError(`Cannot set property ${toCheck} of #<Request> which has only a getter`))
    }
  })

  it.skip('should support wrapping Request instance', () => {
    const url = `${base}hello`

    const form = new FormData()
    form.append('a', '1')
    const { signal } = new AbortController()

    const r1 = new Request(url, {
      method: 'POST',
      follow: 1,
      body: form,
      signal
    })
    const r2 = new Request(r1, {
      follow: 2
    })

    assert.strictEqual(r2.url, url)
    assert.strictEqual(r2.method, 'POST')
    assert.strictEqual(r2.signal[Symbol.toStringTag], 'AbortSignal')
    // Note that we didn't clone the body
    assert.strictEqual(r2.body, form)
    assert.strictEqual(r1.follow, 1)
    assert.strictEqual(r2.follow, 2)
    assert.strictEqual(r1.counter, 0)
    assert.strictEqual(r2.counter, 0)
  })

  it.skip('should override signal on derived Request instances', () => {
    const parentAbortController = new AbortController()
    const derivedAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: derivedAbortController.signal
    })
    assert.strictEqual(parentRequest.signal, parentAbortController.signal)
    assert.strictEqual(derivedRequest.signal, derivedAbortController.signal)
  })

  it.skip('should allow removing signal on derived Request instances', () => {
    const parentAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: null
    })
    assert.strictEqual(parentRequest.signal, parentAbortController.signal)
    assert.strictEqual(derivedRequest.signal, null)
  })

  it('should throw error with GET/HEAD requests with body', () => {
    assert.throws(() => new Request(base, { body: '' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: 'a' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: '', method: 'HEAD' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: 'a', method: 'HEAD' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: '', method: 'get' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: 'a', method: 'get' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: '', method: 'head' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    assert.throws(() => new Request(base, { body: 'a', method: 'head' }), new TypeError('Request with GET/HEAD method cannot have body.'))
  })

  it('should default to null as body', () => {
    const request = new Request(base)
    assert.strictEqual(request.body, null)
    return request.text().then(result => assert.strictEqual(result, ''))
  })

  it('should support parsing headers', () => {
    const url = base
    const request = new Request(url, {
      headers: {
        a: '1'
      }
    })
    assert.strictEqual(request.url, url)
    assert.strictEqual(request.headers.get('a'), '1')
  })

  it('should support arrayBuffer() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    assert.strictEqual(request.url, url)
    return request.arrayBuffer().then(result => {
      assert.ok(result instanceof ArrayBuffer)
      const string = String.fromCharCode.apply(null, new Uint8Array(result))
      assert.strictEqual(string, 'a=1')
    })
  })

  it('should support text() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    assert.strictEqual(request.url, url)
    return request.text().then(result => {
      assert.strictEqual(result, 'a=1')
    })
  })

  it('should support json() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: '{"a":1}'
    })
    assert.strictEqual(request.url, url)
    return request.json().then(result => {
      assert.strictEqual(result.a, 1)
    })
  })

  it('should support blob() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: Buffer.from('a=1')
    })
    assert.strictEqual(request.url, url)
    return request.blob().then(result => {
      assert.ok(result instanceof Blob)
      assert.strictEqual(result.size, 3)
      assert.strictEqual(result.type, '')
    })
  })

  it('should support clone() method', () => {
    const url = base
    const body = stream.Readable.from('a=1')
    const agent = new http.Agent()
    const { signal } = new AbortController()
    const request = new Request(url, {
      body,
      method: 'POST',
      redirect: 'manual',
      headers: {
        b: '2'
      },
      follow: 3,
      compress: false,
      agent,
      signal,
      duplex: 'half'
    })
    const cl = request.clone()
    assert.strictEqual(cl.url, url)
    assert.strictEqual(cl.method, 'POST')
    assert.strictEqual(cl.redirect, 'manual')
    assert.strictEqual(cl.headers.get('b'), '2')
    assert.strictEqual(cl.method, 'POST')
    // Clone body shouldn't be the same body
    assert.notDeepEqual(cl.body, body)
    return Promise.all([cl.text(), request.text()]).then(results => {
      assert.strictEqual(results[0], 'a=1')
      assert.strictEqual(results[1], 'a=1')
    })
  })

  it('should support ArrayBuffer as body', () => {
    const encoder = new TextEncoder()
    const body = encoder.encode('a=12345678901234').buffer
    const request = new Request(base, {
      method: 'POST',
      body
    })
    new Uint8Array(body)[0] = 0
    return request.text().then(result => {
      assert.strictEqual(result, 'a=12345678901234')
    })
  })

  it('should support Uint8Array as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0
    return request.text().then(result => {
      assert.strictEqual(result, '123456789')
    })
  })

  it('should support BigUint64Array as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new BigUint64Array(fullbuffer, 8, 1)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0n
    return request.text().then(result => {
      assert.strictEqual(result, '78901234')
    })
  })

  it('should support DataView as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0
    return request.text().then(result => {
      assert.strictEqual(result, '123456789')
    })
  })
})
