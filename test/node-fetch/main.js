/* eslint no-unused-expressions: "off" */
/* globals AbortController */

// Test tools
const zlib = require('zlib')
const stream = require('stream')
const vm = require('vm')
const chai = require('chai')
const crypto = require('crypto')
const chaiPromised = require('chai-as-promised')
const chaiIterator = require('chai-iterator')
const chaiString = require('chai-string')
const delay = require('delay')
const { Blob } = require('buffer')

const {
  fetch,
  Headers,
  Request,
  FormData,
  Response,
  setGlobalDispatcher,
  Agent
} = require('../../index.js')
const HeadersOrig = require('../../lib/fetch/headers.js').Headers
const RequestOrig = require('../../lib/fetch/request.js').Request
const ResponseOrig = require('../../lib/fetch/response.js').Response
const TestServer = require('./utils/server.js')
const chaiTimeout = require('./utils/chai-timeout.js')
const { ReadableStream } = require('stream/web')

function isNodeLowerThan (version) {
  return !~process.version.localeCompare(version, undefined, { numeric: true })
}

const {
  Uint8Array: VMUint8Array
} = vm.runInNewContext('this')

chai.use(chaiPromised)
chai.use(chaiIterator)
chai.use(chaiString)
chai.use(chaiTimeout)
const { expect } = chai

describe('node-fetch', () => {
  const local = new TestServer()
  let base

  before(async () => {
    await local.start()
    setGlobalDispatcher(new Agent({
      connect: {
        rejectUnauthorized: false
      }
    }))
    base = `http://${local.hostname}:${local.port}/`
  })

  after(async () => {
    return local.stop()
  })

  it('should return a promise', () => {
    const url = `${base}hello`
    const p = fetch(url)
    expect(p).to.be.an.instanceof(Promise)
    expect(p).to.have.property('then')
  })

  it('should expose Headers, Response and Request constructors', () => {
    expect(Headers).to.equal(HeadersOrig)
    expect(Response).to.equal(ResponseOrig)
    expect(Request).to.equal(RequestOrig)
  })

  it('should support proper toString output for Headers, Response and Request objects', () => {
    expect(new Headers().toString()).to.equal('[object Headers]')
    expect(new Response().toString()).to.equal('[object Response]')
    expect(new Request(base).toString()).to.equal('[object Request]')
  })

  it('should reject with error if url is protocol relative', () => {
    const url = '//example.com/'
    return expect(fetch(url)).to.eventually.be.rejectedWith(TypeError)
  })

  it('should reject with error if url is relative path', () => {
    const url = '/some/path'
    return expect(fetch(url)).to.eventually.be.rejectedWith(TypeError)
  })

  it('should reject with error if protocol is unsupported', () => {
    const url = 'ftp://example.com/'
    return expect(fetch(url)).to.eventually.be.rejectedWith(TypeError)
  })

  it('should reject with error on network failure', function () {
    this.timeout(5000)
    const url = 'http://localhost:50000/'
    return expect(fetch(url)).to.eventually.be.rejected
      .and.be.an.instanceOf(TypeError)
  })

  it('should resolve into response', () => {
    const url = `${base}hello`
    return fetch(url).then(res => {
      expect(res).to.be.an.instanceof(Response)
      expect(res.headers).to.be.an.instanceof(Headers)
      expect(res.body).to.be.an.instanceof(ReadableStream)
      expect(res.bodyUsed).to.be.false

      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
      expect(res.statusText).to.equal('OK')
    })
  })

  it('Response.redirect should resolve into response', () => {
    const res = Response.redirect('http://localhost')
    expect(res).to.be.an.instanceof(Response)
    expect(res.headers).to.be.an.instanceof(Headers)
    expect(res.headers.get('location')).to.equal('http://localhost/')
    expect(res.status).to.equal(302)
  })

  it('Response.redirect /w invalid url should fail', () => {
    expect(() => {
      Response.redirect('localhost')
    }).to.throw()
  })

  it('Response.redirect /w invalid status should fail', () => {
    expect(() => {
      Response.redirect('http://localhost', 200)
    }).to.throw()
  })

  it('should accept plain text response', () => {
    const url = `${base}plain`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true
        expect(result).to.be.a('string')
        expect(result).to.equal('text')
      })
    })
  })

  it('should accept html response (like plain text)', () => {
    const url = `${base}html`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/html')
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true
        expect(result).to.be.a('string')
        expect(result).to.equal('<html></html>')
      })
    })
  })

  it('should accept json response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('application/json')
      return res.json().then(result => {
        expect(res.bodyUsed).to.be.true
        expect(result).to.be.an('object')
        expect(result).to.deep.equal({ name: 'value' })
      })
    })
  })

  it('should send request with custom headers', () => {
    const url = `${base}inspect`
    const options = {
      headers: { 'x-custom-header': 'abc' }
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.headers['x-custom-header']).to.equal('abc')
    })
  })

  it('should accept headers instance', () => {
    const url = `${base}inspect`
    const options = {
      headers: new Headers({ 'x-custom-header': 'abc' })
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.headers['x-custom-header']).to.equal('abc')
    })
  })

  it('should follow redirect code 301', () => {
    const url = `${base}redirect/301`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      expect(res.ok).to.be.true
    })
  })

  it('should follow redirect code 302', () => {
    const url = `${base}redirect/302`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should follow redirect code 303', () => {
    const url = `${base}redirect/303`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should follow redirect code 307', () => {
    const url = `${base}redirect/307`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should follow redirect code 308', () => {
    const url = `${base}redirect/308`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should follow redirect chain', () => {
    const url = `${base}redirect/chain`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should follow POST request redirect code 301 with GET', () => {
    const url = `${base}redirect/301`
    const options = {
      method: 'POST',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(result => {
        expect(result.method).to.equal('GET')
        expect(result.body).to.equal('')
      })
    })
  })

  it('should follow PATCH request redirect code 301 with PATCH', () => {
    const url = `${base}redirect/301`
    const options = {
      method: 'PATCH',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(res => {
        expect(res.method).to.equal('PATCH')
        expect(res.body).to.equal('a=1')
      })
    })
  })

  it('should follow POST request redirect code 302 with GET', () => {
    const url = `${base}redirect/302`
    const options = {
      method: 'POST',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(result => {
        expect(result.method).to.equal('GET')
        expect(result.body).to.equal('')
      })
    })
  })

  it('should follow PATCH request redirect code 302 with PATCH', () => {
    const url = `${base}redirect/302`
    const options = {
      method: 'PATCH',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(res => {
        expect(res.method).to.equal('PATCH')
        expect(res.body).to.equal('a=1')
      })
    })
  })

  it('should follow redirect code 303 with GET', () => {
    const url = `${base}redirect/303`
    const options = {
      method: 'PUT',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(result => {
        expect(result.method).to.equal('GET')
        expect(result.body).to.equal('')
      })
    })
  })

  it('should follow PATCH request redirect code 307 with PATCH', () => {
    const url = `${base}redirect/307`
    const options = {
      method: 'PATCH',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
      return res.json().then(result => {
        expect(result.method).to.equal('PATCH')
        expect(result.body).to.equal('a=1')
      })
    })
  })

  it('should not follow non-GET redirect if body is a readable stream', () => {
    const url = `${base}redirect/307`
    const options = {
      method: 'PATCH',
      body: stream.Readable.from('tada')
    }
    return expect(fetch(url, options)).to.eventually.be.rejected
      .and.be.an.instanceOf(TypeError)
  })

  it('should obey maximum redirect, reject case', () => {
    const url = `${base}redirect/chain/20`
    return expect(fetch(url)).to.eventually.be.rejected
      .and.be.an.instanceOf(TypeError)
  })

  it('should obey redirect chain, resolve case', () => {
    const url = `${base}redirect/chain/19`
    return fetch(url).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      expect(res.status).to.equal(200)
    })
  })

  it('should support redirect mode, error flag', () => {
    const url = `${base}redirect/301`
    const options = {
      redirect: 'error'
    }
    return expect(fetch(url, options)).to.eventually.be.rejected
      .and.be.an.instanceOf(TypeError)
  })

  it('should support redirect mode, manual flag when there is no redirect', () => {
    const url = `${base}hello`
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(url)
      expect(res.status).to.equal(200)
      expect(res.headers.get('location')).to.be.null
    })
  })

  it('should follow redirect code 301 and keep existing headers', () => {
    const url = `${base}redirect/301`
    const options = {
      headers: new Headers({ 'x-custom-header': 'abc' })
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(`${base}inspect`)
      return res.json()
    }).then(res => {
      expect(res.headers['x-custom-header']).to.equal('abc')
    })
  })

  it('should treat broken redirect as ordinary response (follow)', () => {
    const url = `${base}redirect/no-location`
    return fetch(url).then(res => {
      expect(res.url).to.equal(url)
      expect(res.status).to.equal(301)
      expect(res.headers.get('location')).to.be.null
    })
  })

  it('should treat broken redirect as ordinary response (manual)', () => {
    const url = `${base}redirect/no-location`
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      expect(res.url).to.equal(url)
      expect(res.status).to.equal(301)
      expect(res.headers.get('location')).to.be.null
    })
  })

  it('should throw a TypeError on an invalid redirect option', () => {
    const url = `${base}redirect/301`
    const options = {
      redirect: 'foobar'
    }
    return fetch(url, options).then(() => {
      expect.fail()
    }, error => {
      expect(error).to.be.an.instanceOf(TypeError)
    })
  })

  it('should set redirected property on response when redirect', () => {
    const url = `${base}redirect/301`
    return fetch(url).then(res => {
      expect(res.redirected).to.be.true
    })
  })

  it('should not set redirected property on response without redirect', () => {
    const url = `${base}hello`
    return fetch(url).then(res => {
      expect(res.redirected).to.be.false
    })
  })

  it('should handle client-error response', () => {
    const url = `${base}error/400`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      expect(res.status).to.equal(400)
      expect(res.statusText).to.equal('Bad Request')
      expect(res.ok).to.be.false
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true
        expect(result).to.be.a('string')
        expect(result).to.equal('client error')
      })
    })
  })

  it('should handle server-error response', () => {
    const url = `${base}error/500`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      expect(res.status).to.equal(500)
      expect(res.statusText).to.equal('Internal Server Error')
      expect(res.ok).to.be.false
      return res.text().then(result => {
        expect(res.bodyUsed).to.be.true
        expect(result).to.be.a('string')
        expect(result).to.equal('server error')
      })
    })
  })

  it('should handle network-error response', () => {
    const url = `${base}error/reset`
    return expect(fetch(url)).to.eventually.be.rejectedWith(TypeError)
  })

  it('should handle network-error partial response', () => {
    const url = `${base}error/premature`
    return fetch(url).then(res => {
      expect(res.status).to.equal(200)
      expect(res.ok).to.be.true
      return expect(res.text()).to.eventually.be.rejectedWith(Error)
    })
  })

  it('should handle network-error in chunked response async iterator', () => {
    const url = `${base}error/premature/chunked`
    return fetch(url).then(res => {
      expect(res.status).to.equal(200)
      expect(res.ok).to.be.true

      const read = async body => {
        const chunks = []
        for await (const chunk of body) {
          chunks.push(chunk)
        }

        return chunks
      }

      return expect(read(res.body))
        .to.eventually.be.rejectedWith(Error)
    })
  })

  it('should handle network-error in chunked response in consumeBody', () => {
    const url = `${base}error/premature/chunked`
    return fetch(url).then(res => {
      expect(res.status).to.equal(200)
      expect(res.ok).to.be.true

      return expect(res.text()).to.eventually.be.rejectedWith(Error)
    })
  })

  it('should handle DNS-error response', () => {
    const url = 'http://domain.invalid'
    return expect(fetch(url)).to.eventually.be.rejectedWith(TypeError)
  })

  it('should reject invalid json response', () => {
    const url = `${base}error/json`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('application/json')
      return expect(res.json()).to.eventually.be.rejectedWith(Error)
    })
  })

  it('should handle response with no status text', () => {
    const url = `${base}no-status-text`
    return fetch(url).then(res => {
      expect(res.statusText).to.equal('')
    })
  })

  it('should handle no content response', () => {
    const url = `${base}no-content`
    return fetch(url).then(res => {
      expect(res.status).to.equal(204)
      expect(res.statusText).to.equal('No Content')
      expect(res.ok).to.be.true
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.be.empty
      })
    })
  })

  it('should reject when trying to parse no content response as json', () => {
    const url = `${base}no-content`
    return fetch(url).then(res => {
      expect(res.status).to.equal(204)
      expect(res.statusText).to.equal('No Content')
      expect(res.ok).to.be.true
      return expect(res.json()).to.eventually.be.rejectedWith(Error)
    })
  })

  it('should handle no content response with gzip encoding', () => {
    const url = `${base}no-content/gzip`
    return fetch(url).then(res => {
      expect(res.status).to.equal(204)
      expect(res.statusText).to.equal('No Content')
      expect(res.headers.get('content-encoding')).to.equal('gzip')
      expect(res.ok).to.be.true
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.be.empty
      })
    })
  })

  it('should handle not modified response', () => {
    const url = `${base}not-modified`
    return fetch(url).then(res => {
      expect(res.status).to.equal(304)
      expect(res.statusText).to.equal('Not Modified')
      expect(res.ok).to.be.false
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.be.empty
      })
    })
  })

  it('should handle not modified response with gzip encoding', () => {
    const url = `${base}not-modified/gzip`
    return fetch(url).then(res => {
      expect(res.status).to.equal(304)
      expect(res.statusText).to.equal('Not Modified')
      expect(res.headers.get('content-encoding')).to.equal('gzip')
      expect(res.ok).to.be.false
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.be.empty
      })
    })
  })

  it('should decompress gzip response', () => {
    const url = `${base}gzip`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  xit('should decompress slightly invalid gzip response', () => {
    const url = `${base}gzip-truncated`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  it('should decompress deflate response', () => {
    const url = `${base}deflate`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  xit('should decompress deflate raw response from old apache server', () => {
    const url = `${base}deflate-raw`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  it('should decompress brotli response', function () {
    if (typeof zlib.createBrotliDecompress !== 'function') {
      this.skip()
    }

    const url = `${base}brotli`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  it('should handle no content response with brotli encoding', function () {
    if (typeof zlib.createBrotliDecompress !== 'function') {
      this.skip()
    }

    const url = `${base}no-content/brotli`
    return fetch(url).then(res => {
      expect(res.status).to.equal(204)
      expect(res.statusText).to.equal('No Content')
      expect(res.headers.get('content-encoding')).to.equal('br')
      expect(res.ok).to.be.true
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.be.empty
      })
    })
  })

  it('should skip decompression if unsupported', () => {
    const url = `${base}sdch`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('fake sdch string')
      })
    })
  })

  it('should skip decompression if unsupported codings', () => {
    const url = `${base}multiunsupported`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('multiunsupported')
      })
    })
  })

  it('should decompress multiple coding', () => {
    const url = `${base}multisupported`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(result => {
        expect(result).to.be.a('string')
        expect(result).to.equal('hello world')
      })
    })
  })

  it('should reject if response compression is invalid', () => {
    const url = `${base}invalid-content-encoding`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return expect(res.text()).to.eventually.be.rejected
    })
  })

  it('should handle errors on the body stream even if it is not used', done => {
    const url = `${base}invalid-content-encoding`
    fetch(url)
      .then(res => {
        expect(res.status).to.equal(200)
      })
      .catch(() => {})
      .then(() => {
        // Wait a few ms to see if a uncaught error occurs
        setTimeout(() => {
          done()
        }, 20)
      })
  })

  it('should collect handled errors on the body stream to reject if the body is used later', () => {
    const url = `${base}invalid-content-encoding`
    return fetch(url).then(delay(20)).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return expect(res.text()).to.eventually.be.rejected
    })
  })

  it('should not overwrite existing accept-encoding header when auto decompression is true', () => {
    const url = `${base}inspect`
    const options = {
      compress: true,
      headers: {
        'Accept-Encoding': 'gzip'
      }
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.headers['accept-encoding']).to.equal('gzip')
    })
  })

  describe('AbortController', () => {
    let controller

    beforeEach(() => {
      controller = new AbortController()
    })

    it('should support request cancellation with signal', () => {
      const fetches = [
        fetch(
          `${base}timeout`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              body: JSON.stringify({ hello: 'world' })
            }
          }
        )
      ]

      controller.abort()

      return Promise.all(fetches.map(fetched => expect(fetched)
        .to.eventually.be.rejected
        .and.be.an.instanceOf(Error)
        .and.have.property('name', 'AbortError')
      ))
    })

    it('should support multiple request cancellation with signal', () => {
      const fetches = [
        fetch(`${base}timeout`, { signal: controller.signal }),
        fetch(
          `${base}timeout`,
          {
            method: 'POST',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              body: JSON.stringify({ hello: 'world' })
            }
          }
        )
      ]

      controller.abort()

      return Promise.all(fetches.map(fetched => expect(fetched)
        .to.eventually.be.rejected
        .and.be.an.instanceOf(Error)
        .and.have.property('name', 'AbortError')
      ))
    })

    it('should reject immediately if signal has already been aborted', () => {
      const url = `${base}timeout`
      const options = {
        signal: controller.signal
      }
      controller.abort()
      const fetched = fetch(url, options)
      return expect(fetched).to.eventually.be.rejected
        .and.be.an.instanceOf(Error)
        .and.have.property('name', 'AbortError')
    })

    it('should allow redirects to be aborted', () => {
      const request = new Request(`${base}redirect/slow`, {
        signal: controller.signal
      })
      setTimeout(() => {
        controller.abort()
      }, 20)
      return expect(fetch(request)).to.be.eventually.rejected
        .and.be.an.instanceOf(Error)
        .and.have.property('name', 'AbortError')
    })

    it('should allow redirected response body to be aborted', () => {
      const request = new Request(`${base}redirect/slow-stream`, {
        signal: controller.signal
      })
      return expect(fetch(request).then(res => {
        expect(res.headers.get('content-type')).to.equal('text/plain')
        const result = res.text()
        controller.abort()
        return result
      })).to.be.eventually.rejected
        .and.be.an.instanceOf(Error)
        .and.have.property('name', 'AbortError')
    })

    it('should reject response body with AbortError when aborted before stream has been read completely', () => {
      return expect(fetch(
        `${base}slow`,
        { signal: controller.signal }
      ))
        .to.eventually.be.fulfilled
        .then(res => {
          const promise = res.text()
          controller.abort()
          return expect(promise)
            .to.eventually.be.rejected
            .and.be.an.instanceof(Error)
            .and.have.property('name', 'AbortError')
        })
    })

    it('should reject response body methods immediately with AbortError when aborted before stream is disturbed', () => {
      return expect(fetch(
        `${base}slow`,
        { signal: controller.signal }
      ))
        .to.eventually.be.fulfilled
        .then(res => {
          controller.abort()
          return expect(res.text())
            .to.eventually.be.rejected
            .and.be.an.instanceof(Error)
            .and.have.property('name', 'TypeError')
        })
    })
  })

  it('should throw a TypeError if a signal is not of type AbortSignal or EventTarget', () => {
    return Promise.all([
      expect(fetch(`${base}inspect`, { signal: {} }))
        .to.be.eventually.rejected
        .and.be.an.instanceof(TypeError),
      expect(fetch(`${base}inspect`, { signal: '' }))
        .to.be.eventually.rejected
        .and.be.an.instanceof(TypeError),
      expect(fetch(`${base}inspect`, { signal: Object.create(null) }))
        .to.be.eventually.rejected
        .and.be.an.instanceof(TypeError)
    ])
  })

  it('should gracefully handle a null signal', () => {
    return fetch(`${base}hello`, { signal: null }).then(res => {
      return expect(res.ok).to.be.true
    })
  })

  it('should allow setting User-Agent', () => {
    const url = `${base}inspect`
    const options = {
      headers: {
        'user-agent': 'faked'
      }
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.headers['user-agent']).to.equal('faked')
    })
  })

  it('should set default Accept header', () => {
    const url = `${base}inspect`
    fetch(url).then(res => res.json()).then(res => {
      expect(res.headers.accept).to.equal('*/*')
    })
  })

  it('should allow setting Accept header', () => {
    const url = `${base}inspect`
    const options = {
      headers: {
        accept: 'application/json'
      }
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.headers.accept).to.equal('application/json')
    })
  })

  it('should allow POST request', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('0')
    })
  })

  it('should allow POST request with string body', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.equal('text/plain;charset=UTF-8')
      expect(res.headers['content-length']).to.equal('3')
    })
  })

  it('should allow POST request with buffer body', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: Buffer.from('a=1', 'utf-8')
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('3')
    })
  })

  it('should allow POST request with ArrayBuffer body', () => {
    const encoder = new TextEncoder()
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: encoder.encode('Hello, world!\n').buffer
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('Hello, world!\n')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('14')
    })
  })

  it('should allow POST request with ArrayBuffer body from a VM context', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new VMUint8Array(Buffer.from('Hello, world!\n')).buffer
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('Hello, world!\n')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('14')
    })
  })

  it('should allow POST request with ArrayBufferView (Uint8Array) body', () => {
    const encoder = new TextEncoder()
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: encoder.encode('Hello, world!\n')
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('Hello, world!\n')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('14')
    })
  })

  it('should allow POST request with ArrayBufferView (DataView) body', () => {
    const encoder = new TextEncoder()
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new DataView(encoder.encode('Hello, world!\n').buffer)
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('Hello, world!\n')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('14')
    })
  })

  it('should allow POST request with ArrayBufferView (Uint8Array) body from a VM context', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new VMUint8Array(Buffer.from('Hello, world!\n'))
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('Hello, world!\n')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('14')
    })
  })

  it('should allow POST request with ArrayBufferView (Uint8Array, offset, length) body', () => {
    const encoder = new TextEncoder()
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: encoder.encode('Hello, world!\n').subarray(7, 13)
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('world!')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('6')
    })
  })

  it('should allow POST request with blob body without type', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new Blob(['a=1'])
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.be.undefined
      // expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.equal('3')
    })
  })

  it('should allow POST request with blob body with type', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new Blob(['a=1'], {
        type: 'text/plain;charset=UTF-8'
      })
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-type']).to.equal('text/plain;charset=utf-8')
      expect(res.headers['content-length']).to.equal('3')
    })
  })

  it('should allow POST request with readable stream as body', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: stream.Readable.from('a=1')
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.equal('chunked')
      expect(res.headers['content-type']).to.be.undefined
      expect(res.headers['content-length']).to.be.undefined
    })
  })

  it('should allow POST request with object body', () => {
    const url = `${base}inspect`
    // Note that fetch simply calls tostring on an object
    const options = {
      method: 'POST',
      body: { a: 1 }
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.body).to.equal('[object Object]')
      expect(res.headers['content-type']).to.equal('text/plain;charset=UTF-8')
      expect(res.headers['content-length']).to.equal('15')
    })
  })

  it('should allow POST request with form-data as body', () => {
    const form = new FormData()
    form.append('a', '1')

    const url = `${base}multipart`
    const options = {
      method: 'POST',
      body: form
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.headers['content-type']).to.startWith('multipart/form-data; boundary=')
      expect(res.body).to.equal('a=1')
    })
  })

  it('constructing a Response with URLSearchParams as body should have a Content-Type', () => {
    const parameters = new URLSearchParams()
    const res = new Response(parameters)
    res.headers.get('Content-Type')
    expect(res.headers.get('Content-Type')).to.equal('application/x-www-form-urlencoded;charset=UTF-8')
  })

  it('constructing a Request with URLSearchParams as body should have a Content-Type', () => {
    const parameters = new URLSearchParams()
    const request = new Request(base, { method: 'POST', body: parameters })
    expect(request.headers.get('Content-Type')).to.equal('application/x-www-form-urlencoded;charset=UTF-8')
  })

  it('Reading a body with URLSearchParams should echo back the result', () => {
    const parameters = new URLSearchParams()
    parameters.append('a', '1')
    return new Response(parameters).text().then(text => {
      expect(text).to.equal('a=1')
    })
  })

  // Body should been cloned...
  it('constructing a Request/Response with URLSearchParams and mutating it should not affected body', () => {
    const parameters = new URLSearchParams()
    const request = new Request(`${base}inspect`, { method: 'POST', body: parameters })
    parameters.append('a', '1')
    return request.text().then(text => {
      expect(text).to.equal('')
    })
  })

  it('should allow POST request with URLSearchParams as body', () => {
    const parameters = new URLSearchParams()
    parameters.append('a', '1')

    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: parameters
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.headers['content-type']).to.equal('application/x-www-form-urlencoded;charset=UTF-8')
      expect(res.headers['content-length']).to.equal('3')
      expect(res.body).to.equal('a=1')
    })
  })

  it('should still recognize URLSearchParams when extended', () => {
    class CustomSearchParameters extends URLSearchParams {}
    const parameters = new CustomSearchParameters()
    parameters.append('a', '1')

    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: parameters
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('POST')
      expect(res.headers['content-type']).to.equal('application/x-www-form-urlencoded;charset=UTF-8')
      expect(res.headers['content-length']).to.equal('3')
      expect(res.body).to.equal('a=1')
    })
  })

  it('should allow PUT request', () => {
    const url = `${base}inspect`
    const options = {
      method: 'PUT',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('PUT')
      expect(res.body).to.equal('a=1')
    })
  })

  it('should allow DELETE request', () => {
    const url = `${base}inspect`
    const options = {
      method: 'DELETE'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('DELETE')
    })
  })

  it('should allow DELETE request with string body', () => {
    const url = `${base}inspect`
    const options = {
      method: 'DELETE',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('DELETE')
      expect(res.body).to.equal('a=1')
      expect(res.headers['transfer-encoding']).to.be.undefined
      expect(res.headers['content-length']).to.equal('3')
    })
  })

  it('should allow PATCH request', () => {
    const url = `${base}inspect`
    const options = {
      method: 'PATCH',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      expect(res.method).to.equal('PATCH')
      expect(res.body).to.equal('a=1')
    })
  })

  it('should allow HEAD request', () => {
    const url = `${base}hello`
    const options = {
      method: 'HEAD'
    }
    return fetch(url, options).then(res => {
      expect(res.status).to.equal(200)
      expect(res.statusText).to.equal('OK')
      expect(res.headers.get('content-type')).to.equal('text/plain')
      // expect(res.body).to.be.an.instanceof(stream.Transform)
      return res.text()
    }).then(text => {
      expect(text).to.equal('')
    })
  })

  it('should allow HEAD request with content-encoding header', () => {
    const url = `${base}error/404`
    const options = {
      method: 'HEAD'
    }
    return fetch(url, options).then(res => {
      expect(res.status).to.equal(404)
      expect(res.headers.get('content-encoding')).to.equal('gzip')
      return res.text()
    }).then(text => {
      expect(text).to.equal('')
    })
  })

  it('should allow OPTIONS request', () => {
    const url = `${base}options`
    const options = {
      method: 'OPTIONS'
    }
    return fetch(url, options).then(res => {
      expect(res.status).to.equal(200)
      expect(res.statusText).to.equal('OK')
      expect(res.headers.get('allow')).to.equal('GET, HEAD, OPTIONS')
      // expect(res.body).to.be.an.instanceof(stream.Transform)
    })
  })

  it('should reject decoding body twice', () => {
    const url = `${base}plain`
    return fetch(url).then(res => {
      expect(res.headers.get('content-type')).to.equal('text/plain')
      return res.text().then(() => {
        expect(res.bodyUsed).to.be.true
        return expect(res.text()).to.eventually.be.rejectedWith(Error)
      })
    })
  })

  it('should allow cloning a json response and log it as text response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return Promise.all([res.json(), r1.text()]).then(results => {
        expect(results[0]).to.deep.equal({ name: 'value' })
        expect(results[1]).to.equal('{"name":"value"}')
      })
    })
  })

  it('should allow cloning a json response, and then log it as text response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return res.json().then(result => {
        expect(result).to.deep.equal({ name: 'value' })
        return r1.text().then(result => {
          expect(result).to.equal('{"name":"value"}')
        })
      })
    })
  })

  it('should allow cloning a json response, first log as text response, then return json object', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return r1.text().then(result => {
        expect(result).to.equal('{"name":"value"}')
        return res.json().then(result => {
          expect(result).to.deep.equal({ name: 'value' })
        })
      })
    })
  })

  it('should not allow cloning a response after its been used', () => {
    const url = `${base}hello`
    return fetch(url).then(res =>
      res.text().then(() => {
        expect(() => {
          res.clone()
        }).to.throw(Error)
      })
    )
  })

  xit('should timeout on cloning response without consuming one of the streams when the second packet size is equal default highWaterMark', function () {
    this.timeout(300)
    const url = local.mockState(res => {
      // Observed behavior of TCP packets splitting:
      // - response body size <= 65438 → single packet sent
      // - response body size  > 65438 → multiple packets sent
      // Max TCP packet size is 64kB (http://stackoverflow.com/a/2614188/5763764),
      // but first packet probably transfers more than the response body.
      const firstPacketMaxSize = 65438
      const secondPacketSize = 16 * 1024 // = defaultHighWaterMark
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize))
    })
    return expect(
      fetch(url).then(res => res.clone().buffer())
    ).to.timeout
  })

  xit('should timeout on cloning response without consuming one of the streams when the second packet size is equal custom highWaterMark', function () {
    this.timeout(300)
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 10
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize))
    })
    return expect(
      fetch(url, { highWaterMark: 10 }).then(res => res.clone().buffer())
    ).to.timeout
  })

  xit('should not timeout on cloning response without consuming one of the streams when the second packet size is less than default highWaterMark', function () {
    // TODO: fix test.
    if (!isNodeLowerThan('v16.0.0')) {
      this.skip()
    }

    this.timeout(300)
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 16 * 1024 // = defaultHighWaterMark
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize - 1))
    })
    return expect(
      fetch(url).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  xit('should not timeout on cloning response without consuming one of the streams when the second packet size is less than custom highWaterMark', function () {
    // TODO: fix test.
    if (!isNodeLowerThan('v16.0.0')) {
      this.skip()
    }

    this.timeout(300)
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 10
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize - 1))
    })
    return expect(
      fetch(url, { highWaterMark: 10 }).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  xit('should not timeout on cloning response without consuming one of the streams when the response size is double the custom large highWaterMark - 1', function () {
    // TODO: fix test.
    if (!isNodeLowerThan('v16.0.0')) {
      this.skip()
    }

    this.timeout(300)
    const url = local.mockState(res => {
      res.end(crypto.randomBytes((2 * 512 * 1024) - 1))
    })
    return expect(
      fetch(url, { highWaterMark: 512 * 1024 }).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  xit('should allow get all responses of a header', () => {
    // TODO: fix test.
    const url = `${base}cookie`
    return fetch(url).then(res => {
      const expected = 'a=1, b=1'
      expect(res.headers.get('set-cookie')).to.equal(expected)
      expect(res.headers.get('Set-Cookie')).to.equal(expected)
    })
  })

  it('should support fetch with Request instance', () => {
    const url = `${base}hello`
    const request = new Request(url)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('should support fetch with Node.js URL object', () => {
    const url = `${base}hello`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('should support fetch with WHATWG URL object', () => {
    const url = `${base}hello`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('should keep `?` sign in URL when no params are given', () => {
    const url = `${base}question?`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('if params are given, do not modify anything', () => {
    const url = `${base}question?a=1`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('should preserve the hash (#) symbol', () => {
    const url = `${base}question?#`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      expect(res.url).to.equal(url)
      expect(res.ok).to.be.true
      expect(res.status).to.equal(200)
    })
  })

  it('should support reading blob as text', () => {
    return new Response('hello')
      .blob()
      .then(blob => blob.text())
      .then(body => {
        expect(body).to.equal('hello')
      })
  })

  it('should support reading blob as arrayBuffer', () => {
    return new Response('hello')
      .blob()
      .then(blob => blob.arrayBuffer())
      .then(ab => {
        const string = String.fromCharCode.apply(null, new Uint8Array(ab))
        expect(string).to.equal('hello')
      })
  })

  it('should support blob round-trip', () => {
    const url = `${base}hello`

    let length
    let type

    return fetch(url).then(res => res.blob()).then(async blob => {
      const url = `${base}inspect`
      length = blob.size
      type = blob.type
      return fetch(url, {
        method: 'POST',
        body: blob
      })
    }).then(res => res.json()).then(({ body, headers }) => {
      expect(body).to.equal('world')
      expect(headers['content-type']).to.equal(type)
      expect(headers['content-length']).to.equal(String(length))
    })
  })

  it('should support overwrite Request instance', () => {
    const url = `${base}inspect`
    const request = new Request(url, {
      method: 'POST',
      headers: {
        a: '1'
      }
    })
    return fetch(request, {
      method: 'GET',
      headers: {
        a: '2'
      }
    }).then(res => {
      return res.json()
    }).then(body => {
      expect(body.method).to.equal('GET')
      expect(body.headers.a).to.equal('2')
    })
  })

  it('should support http request', function () {
    this.timeout(5000)
    const url = 'https://github.com/'
    const options = {
      method: 'HEAD'
    }
    return fetch(url, options).then(res => {
      expect(res.status).to.equal(200)
      expect(res.ok).to.be.true
    })
  })

  it('should encode URLs as UTF-8', async () => {
    const url = `${base}möbius`
    const res = await fetch(url)
    expect(res.url).to.equal(`${base}m%C3%B6bius`)
  })

  it('should allow manual redirect handling', function () {
    this.timeout(5000)
    const url = 'https://httpbin.org/status/302'
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      expect(res.status).to.equal(302)
      expect(res.url).to.equal(url)
      expect(res.type).to.equal('basic')
      expect(res.headers.get('Location')).to.equal('/redirect/1')
      expect(res.ok).to.be.false
    })
  })
})
