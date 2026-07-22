'use strict'

const { describe, it, before, after } = require('node:test')
const stream = require('node:stream')
const http = require('node:http')

const { Request, FormData } = require('../../index.js')
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

  it('should have attributes conforming to Web IDL', (t) => {
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
      t.assert.ok(enumerableProperties.includes(toCheck))
    }

    for (const toCheck of [
      'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal'
    ]) {
      t.assert.throws(() => {
        request[toCheck] = 'abc'
      }, new TypeError(`Cannot set property ${toCheck} of #<Request> which has only a getter`))
    }
  })

  it.skip('should support wrapping Request instance', (t) => {
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

    t.assert.strictEqual(r2.url, url)
    t.assert.strictEqual(r2.method, 'POST')
    t.assert.strictEqual(r2.signal[Symbol.toStringTag], 'AbortSignal')
    // Note that we didn't clone the body
    t.assert.strictEqual(r2.body, form)
    t.assert.strictEqual(r1.follow, 1)
    t.assert.strictEqual(r2.follow, 2)
    t.assert.strictEqual(r1.counter, 0)
    t.assert.strictEqual(r2.counter, 0)
  })

  it.skip('should override signal on derived Request instances', (t) => {
    const parentAbortController = new AbortController()
    const derivedAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: derivedAbortController.signal
    })
    t.assert.strictEqual(parentRequest.signal, parentAbortController.signal)
    t.assert.strictEqual(derivedRequest.signal, derivedAbortController.signal)
  })

  it.skip('should allow removing signal on derived Request instances', (t) => {
    const parentAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: null
    })
    t.assert.strictEqual(parentRequest.signal, parentAbortController.signal)
    t.assert.strictEqual(derivedRequest.signal, null)
  })

  it('should throw error with GET/HEAD requests with body', (t) => {
    t.assert.throws(() => new Request(base, { body: '' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: 'a' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: '', method: 'HEAD' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: 'a', method: 'HEAD' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: '', method: 'get' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: 'a', method: 'get' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: '', method: 'head' }), new TypeError('Request with GET/HEAD method cannot have body.'))
    t.assert.throws(() => new Request(base, { body: 'a', method: 'head' }), new TypeError('Request with GET/HEAD method cannot have body.'))
  })

  it('should default to null as body', (t) => {
    const request = new Request(base)
    t.assert.strictEqual(request.body, null)
    return request.text().then(result => t.assert.strictEqual(result, ''))
  })

  it('should support parsing headers', (t) => {
    const url = base
    const request = new Request(url, {
      headers: {
        a: '1'
      }
    })
    t.assert.strictEqual(request.url, url)
    t.assert.strictEqual(request.headers.get('a'), '1')
  })

  it('should support arrayBuffer() method', (t) => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    t.assert.strictEqual(request.url, url)
    return request.arrayBuffer().then(result => {
      t.assert.ok(result instanceof ArrayBuffer)
      const string = String.fromCharCode.apply(null, new Uint8Array(result))
      t.assert.strictEqual(string, 'a=1')
    })
  })

  it('should support text() method', (t) => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    t.assert.strictEqual(request.url, url)
    return request.text().then(result => {
      t.assert.strictEqual(result, 'a=1')
    })
  })

  it('should support json() method', (t) => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: '{"a":1}'
    })
    t.assert.strictEqual(request.url, url)
    return request.json().then(result => {
      t.assert.strictEqual(result.a, 1)
    })
  })

  it('should support blob() method', (t) => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: Buffer.from('a=1')
    })
    t.assert.strictEqual(request.url, url)
    return request.blob().then(result => {
      t.assert.ok(result instanceof Blob)
      t.assert.strictEqual(result.size, 3)
      t.assert.strictEqual(result.type, '')
    })
  })

  it('should support clone() method', (t) => {
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
    t.assert.strictEqual(cl.url, url)
    t.assert.strictEqual(cl.method, 'POST')
    t.assert.strictEqual(cl.redirect, 'manual')
    t.assert.strictEqual(cl.headers.get('b'), '2')
    t.assert.strictEqual(cl.method, 'POST')
    // Clone body shouldn't be the same body
    t.assert.notDeepEqual(cl.body, body)
    return Promise.all([cl.text(), request.text()]).then(results => {
      t.assert.strictEqual(results[0], 'a=1')
      t.assert.strictEqual(results[1], 'a=1')
    })
  })

  it('should support ArrayBuffer as body', (t) => {
    const encoder = new TextEncoder()
    const body = encoder.encode('a=12345678901234').buffer
    const request = new Request(base, {
      method: 'POST',
      body
    })
    new Uint8Array(body)[0] = 0
    return request.text().then(result => {
      t.assert.strictEqual(result, 'a=12345678901234')
    })
  })

  it('should support Uint8Array as body', (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0
    return request.text().then(result => {
      t.assert.strictEqual(result, '123456789')
    })
  })

  it('should support BigUint64Array as body', (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new BigUint64Array(fullbuffer, 8, 1)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0n
    return request.text().then(result => {
      t.assert.strictEqual(result, '78901234')
    })
  })

  it('should support DataView as body', (t) => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const request = new Request(base, {
      method: 'POST',
      body
    })
    body[0] = 0
    return request.text().then(result => {
      t.assert.strictEqual(result, '123456789')
    })
  })
})
