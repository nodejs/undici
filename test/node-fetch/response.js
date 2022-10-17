/* eslint no-unused-expressions: "off" */

const chai = require('chai')
const stream = require('stream')
const { Response } = require('../../lib/fetch/response.js')
const TestServer = require('./utils/server.js')
const { Blob } = require('buffer')
const { kState } = require('../../lib/fetch/symbols.js')

const { expect } = chai

describe('Response', () => {
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
      expect(enumerableProperties).to.contain(toCheck)
    }

    // TODO
    // for (const toCheck of [
    //   'body',
    //   'bodyUsed',
    //   'type',
    //   'url',
    //   'status',
    //   'ok',
    //   'redirected',
    //   'statusText',
    //   'headers'
    // ]) {
    //   expect(() => {
    //     res[toCheck] = 'abc'
    //   }).to.throw()
    // }
  })

  it('should support empty options', () => {
    const res = new Response(stream.Readable.from('a=1'))
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support parsing headers', () => {
    const res = new Response(null, {
      headers: {
        a: '1'
      }
    })
    expect(res.headers.get('a')).to.equal('1')
  })

  it('should support text() method', () => {
    const res = new Response('a=1')
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support json() method', () => {
    const res = new Response('{"a":1}')
    return res.json().then(result => {
      expect(result.a).to.equal(1)
    })
  })

  if (Blob) {
    it('should support blob() method', () => {
      const res = new Response('a=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        }
      })
      return res.blob().then(result => {
        expect(result).to.be.an.instanceOf(Blob)
        expect(result.size).to.equal(3)
        expect(result.type).to.equal('text/plain')
      })
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
    res[kState].urlList = [new URL(base)]
    const cl = res.clone()
    expect(cl.headers.get('a')).to.equal('1')
    expect(cl.type).to.equal('default')
    expect(cl.url).to.equal(base)
    expect(cl.status).to.equal(346)
    expect(cl.statusText).to.equal('production')
    expect(cl.ok).to.be.false
    // Clone body shouldn't be the same body
    expect(cl.body).to.not.equal(body)
    return Promise.all([cl.text(), res.text()]).then(results => {
      expect(results[0]).to.equal('a=1')
      expect(results[1]).to.equal('a=1')
    })
  })

  it('should support stream as body', () => {
    const body = stream.Readable.from('a=1')
    const res = new Response(body)
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support string as body', () => {
    const res = new Response('a=1')
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support buffer as body', () => {
    const res = new Response(Buffer.from('a=1'))
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support ArrayBuffer as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const res = new Response(fullbuffer)
    new Uint8Array(fullbuffer)[0] = 0
    return res.text().then(result => {
      expect(result).to.equal('a=12345678901234')
    })
  })

  it('should support blob as body', async () => {
    const res = new Response(new Blob(['a=1']))
    return res.text().then(result => {
      expect(result).to.equal('a=1')
    })
  })

  it('should support Uint8Array as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0
    return res.text().then(result => {
      expect(result).to.equal('123456789')
    })
  })

  it('should support BigUint64Array as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new BigUint64Array(fullbuffer, 8, 1)
    const res = new Response(body)
    body[0] = 0n
    return res.text().then(result => {
      expect(result).to.equal('78901234')
    })
  })

  it('should support DataView as body', () => {
    const encoder = new TextEncoder()
    const fullbuffer = encoder.encode('a=12345678901234').buffer
    const body = new Uint8Array(fullbuffer, 2, 9)
    const res = new Response(body)
    body[0] = 0
    return res.text().then(result => {
      expect(result).to.equal('123456789')
    })
  })

  it('should default to null as body', () => {
    const res = new Response()
    expect(res.body).to.equal(null)

    return res.text().then(result => expect(result).to.equal(''))
  })

  it('should default to 200 as status code', () => {
    const res = new Response(null)
    expect(res.status).to.equal(200)
  })

  it('should default to empty string as url', () => {
    const res = new Response()
    expect(res.url).to.equal('')
  })

  it('should support error() static method', () => {
    const res = Response.error()
    expect(res).to.be.an.instanceof(Response)
    expect(res.type).to.equal('error')
    expect(res.status).to.equal(0)
    expect(res.statusText).to.equal('')
  })

  it('should support undefined status', () => {
    const res = new Response(null, { status: undefined })
    expect(res.status).to.equal(200)
  })

  it('should support undefined statusText', () => {
    const res = new Response(null, { statusText: undefined })
    expect(res.statusText).to.equal('')
  })

  it('should not set bodyUsed to undefined', () => {
    const res = new Response()
    expect(res.bodyUsed).to.be.false
  })
})
