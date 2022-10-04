const stream = require('stream')
const http = require('http')

const chai = require('chai')
const { Blob } = require('buffer')

const Request = require('../../lib/fetch/request.js').Request
const TestServer = require('./utils/server.js')

const { expect } = chai

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
      expect(enumerableProperties).to.contain(toCheck)
    }

    // for (const toCheck of [
    //   'body', 'bodyUsed', 'method', 'url', 'headers', 'redirect', 'signal'
    // ]) {
    //   expect(() => {
    //     request[toCheck] = 'abc'
    //   }).to.throw()
    // }
  })

  // it('should support wrapping Request instance', () => {
  //   const url = `${base}hello`

  //   const form = new FormData()
  //   form.append('a', '1')
  //   const { signal } = new AbortController()

  //   const r1 = new Request(url, {
  //     method: 'POST',
  //     follow: 1,
  //     body: form,
  //     signal
  //   })
  //   const r2 = new Request(r1, {
  //     follow: 2
  //   })

  //   expect(r2.url).to.equal(url)
  //   expect(r2.method).to.equal('POST')
  //   expect(r2.signal).to.equal(signal)
  //   // Note that we didn't clone the body
  //   expect(r2.body).to.equal(form)
  //   expect(r1.follow).to.equal(1)
  //   expect(r2.follow).to.equal(2)
  //   expect(r1.counter).to.equal(0)
  //   expect(r2.counter).to.equal(0)
  // })

  xit('should override signal on derived Request instances', () => {
    const parentAbortController = new AbortController()
    const derivedAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: derivedAbortController.signal
    })
    expect(parentRequest.signal).to.equal(parentAbortController.signal)
    expect(derivedRequest.signal).to.equal(derivedAbortController.signal)
  })

  xit('should allow removing signal on derived Request instances', () => {
    const parentAbortController = new AbortController()
    const parentRequest = new Request(`${base}hello`, {
      signal: parentAbortController.signal
    })
    const derivedRequest = new Request(parentRequest, {
      signal: null
    })
    expect(parentRequest.signal).to.equal(parentAbortController.signal)
    expect(derivedRequest.signal).to.equal(null)
  })

  it('should throw error with GET/HEAD requests with body', () => {
    expect(() => new Request(base, { body: '' }))
      .to.throw(TypeError)
    expect(() => new Request(base, { body: 'a' }))
      .to.throw(TypeError)
    expect(() => new Request(base, { body: '', method: 'HEAD' }))
      .to.throw(TypeError)
    expect(() => new Request(base, { body: 'a', method: 'HEAD' }))
      .to.throw(TypeError)
    expect(() => new Request(base, { body: 'a', method: 'get' }))
      .to.throw(TypeError)
    expect(() => new Request(base, { body: 'a', method: 'head' }))
      .to.throw(TypeError)
  })

  it('should default to null as body', () => {
    const request = new Request(base)
    expect(request.body).to.equal(null)
    return request.text().then(result => expect(result).to.equal(''))
  })

  it('should support parsing headers', () => {
    const url = base
    const request = new Request(url, {
      headers: {
        a: '1'
      }
    })
    expect(request.url).to.equal(url)
    expect(request.headers.get('a')).to.equal('1')
  })

  it('should support arrayBuffer() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    expect(request.url).to.equal(url)
    return request.arrayBuffer().then(result => {
      expect(result).to.be.an.instanceOf(ArrayBuffer)
      const string = String.fromCharCode.apply(null, new Uint8Array(result))
      expect(string).to.equal('a=1')
    })
  })

  it('should support text() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: 'a=1'
    })
    expect(request.url).to.equal(url)
    return request.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support json() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: '{"a":1}'
    })
    expect(request.url).to.equal(url)
    return request.json().then(result => {
      expect(result.a).to.equal(1)
    })
  })

  it('should support blob() method', () => {
    const url = base
    const request = new Request(url, {
      method: 'POST',
      body: Buffer.from('a=1')
    })
    expect(request.url).to.equal(url)
    return request.blob().then(result => {
      expect(result).to.be.an.instanceOf(Blob)
      expect(result.size).to.equal(3)
      expect(result.type).to.equal('')
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
    expect(cl.url).to.equal(url)
    expect(cl.method).to.equal('POST')
    expect(cl.redirect).to.equal('manual')
    expect(cl.headers.get('b')).to.equal('2')
    expect(cl.method).to.equal('POST')
    // Clone body shouldn't be the same body
    expect(cl.body).to.not.equal(body)
    return Promise.all([cl.text(), request.text()]).then(results => {
      expect(results[0]).to.equal('a=1')
      expect(results[1]).to.equal('a=1')
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
      expect(result).to.equal('a=12345678901234')
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
      expect(result).to.equal('123456789')
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
      expect(result).to.equal('78901234')
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
      expect(result).to.equal('123456789')
    })
  })
})
