'use strict'

// Test tools
const assert = require('node:assert')
const { describe, it, before, beforeEach, after } = require('node:test')
const { setTimeout: delay } = require('node:timers/promises')
const zlib = require('node:zlib')
const stream = require('node:stream')
const vm = require('node:vm')
const crypto = require('node:crypto')
const { Blob } = require('node:buffer')

const {
  fetch,
  Headers,
  Request,
  FormData,
  Response,
  setGlobalDispatcher,
  Agent
} = require('../../index.js')
const HeadersOrig = require('../../lib/web/fetch/headers.js').Headers
const ResponseOrig = require('../../lib/web/fetch/response.js').Response
const RequestOrig = require('../../lib/web/fetch/request.js').Request
const TestServer = require('./utils/server.js')
const { createServer } = require('node:http')
const { default: tspl } = require('@matteo.collina/tspl')

const {
  Uint8Array: VMUint8Array
} = vm.runInNewContext('this')

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
    assert.ok(p instanceof Promise)
    assert.strictEqual(typeof p.then, 'function')
  })

  it('should expose Headers, Response and Request constructors', () => {
    assert.strictEqual(Headers, HeadersOrig)
    assert.strictEqual(Response, ResponseOrig)
    assert.strictEqual(Request, RequestOrig)
  })

  it('should support proper toString output for Headers, Response and Request objects', () => {
    assert.strictEqual(new Headers().toString(), '[object Headers]')
    assert.strictEqual(new Response().toString(), '[object Response]')
    assert.strictEqual(new Request(base).toString(), '[object Request]')
  })
  // TODO Should we reflect the input?
  it('should reject with error if url is protocol relative', () => {
    const url = '//example.com/'
    return assert.rejects(fetch(url), new TypeError('Failed to parse URL from //example.com/'))
  })

  it('should reject with error if url is relative path', () => {
    const url = '/some/path'
    return assert.rejects(fetch(url), new TypeError('Failed to parse URL from /some/path'))
  })

  // TODO: This seems odd
  it('should reject with error if protocol is unsupported', () => {
    const url = 'ftp://example.com/'
    return assert.rejects(fetch(url), new TypeError('fetch failed'))
  })

  it('should reject with error on network failure', { timeout: 5000 }, function () {
    const url = 'http://localhost:50000/'
    return assert.rejects(fetch(url), new TypeError('fetch failed'))
  })

  it('should resolve into response', () => {
    const url = `${base}hello`
    return fetch(url).then(res => {
      assert.ok(res instanceof Response)
      assert.ok(res.headers instanceof Headers)
      assert.ok(res.body instanceof ReadableStream)
      assert.strictEqual(res.bodyUsed, false)

      assert.strictEqual(res.url, url)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.statusText, 'OK')
    })
  })

  it('Response.redirect should resolve into response', () => {
    const res = Response.redirect('http://localhost')
    assert.ok(res instanceof Response)
    assert.ok(res.headers instanceof Headers)
    assert.strictEqual(res.headers.get('location'), 'http://localhost/')
    assert.strictEqual(res.status, 302)
  })

  it('Response.redirect /w invalid url should fail', () => {
    assert.throws(() => {
      Response.redirect('localhost')
    })
  })

  it('Response.redirect /w invalid status should fail', () => {
    assert.throws(() => {
      Response.redirect('http://localhost', 200)
    })
  })

  it('should accept plain text response', () => {
    const url = `${base}plain`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(res.bodyUsed, true)
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'text')
      })
    })
  })

  it('should accept html response (like plain text)', () => {
    const url = `${base}html`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/html')
      return res.text().then(result => {
        assert.strictEqual(res.bodyUsed, true)
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '<html></html>')
      })
    })
  })

  it('should accept json response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'application/json')
      return res.json().then(result => {
        assert.strictEqual(res.bodyUsed, true)
        assert.strictEqual(typeof result, 'object')
        assert.deepStrictEqual(result, { name: 'value' })
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
      assert.strictEqual(res.headers['x-custom-header'], 'abc')
    })
  })

  it('should send request with custom headers array', () => {
    const url = `${base}inspect`
    const options = {
      headers: { 'x-custom-header': ['abc'] }
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      assert.strictEqual(res.headers['x-custom-header'], 'abc')
    })
  })

  it('should send request with multi-valued headers', () => {
    const url = `${base}inspect`
    const options = {
      headers: { 'x-custom-header': ['abc', '123'] }
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      assert.strictEqual(res.headers['x-custom-header'], 'abc,123')
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
      assert.strictEqual(res.headers['x-custom-header'], 'abc')
    })
  })

  it('should follow redirect code 301', () => {
    const url = `${base}redirect/301`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.ok, true)
    })
  })

  it('should follow redirect code 302', () => {
    const url = `${base}redirect/302`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should follow redirect code 303', () => {
    const url = `${base}redirect/303`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should follow redirect code 307', () => {
    const url = `${base}redirect/307`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should follow redirect code 308', () => {
    const url = `${base}redirect/308`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should follow redirect chain', () => {
    const url = `${base}redirect/chain`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should follow POST request redirect code 301 with GET', () => {
    const url = `${base}redirect/301`
    const options = {
      method: 'POST',
      body: 'a=1'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(result => {
        assert.strictEqual(result.method, 'GET')
        assert.strictEqual(result.body, '')
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
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(res => {
        assert.strictEqual(res.method, 'PATCH')
        assert.strictEqual(res.body, 'a=1')
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
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(result => {
        assert.strictEqual(result.method, 'GET')
        assert.strictEqual(result.body, '')
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
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(res => {
        assert.strictEqual(res.method, 'PATCH')
        assert.strictEqual(res.body, 'a=1')
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
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(result => {
        assert.strictEqual(result.method, 'GET')
        assert.strictEqual(result.body, '')
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
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
      return res.json().then(result => {
        assert.strictEqual(result.method, 'PATCH')
        assert.strictEqual(result.body, 'a=1')
      })
    })
  })

  it('should not follow non-GET redirect if body is a readable stream', () => {
    const url = `${base}redirect/307`
    const options = {
      method: 'PATCH',
      body: stream.Readable.from('tada')
    }
    return assert.rejects(fetch(url, options), new TypeError('RequestInit: duplex option is required when sending a body.'))
  })

  it('should obey maximum redirect, reject case', () => {
    const url = `${base}redirect/chain/20`
    return assert.rejects(fetch(url), new TypeError('fetch failed'))
  })

  it('should obey redirect chain, resolve case', () => {
    const url = `${base}redirect/chain/19`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should support redirect mode, error flag', () => {
    const url = `${base}redirect/301`
    const options = {
      redirect: 'error'
    }
    return assert.rejects(fetch(url, options), new TypeError('fetch failed'))
  })

  it('should support redirect mode, manual flag when there is no redirect', () => {
    const url = `${base}hello`
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.headers.get('location'), null)
    })
  })

  it('should follow redirect code 301 and keep existing headers', () => {
    const url = `${base}redirect/301`
    const options = {
      headers: new Headers({ 'x-custom-header': 'abc' })
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.url, `${base}inspect`)
      return res.json()
    }).then(res => {
      assert.strictEqual(res.headers['x-custom-header'], 'abc')
    })
  })

  it('should treat broken redirect as ordinary response (follow)', () => {
    const url = `${base}redirect/no-location`
    return fetch(url).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.status, 301)
      assert.strictEqual(res.headers.get('location'), null)
    })
  })

  it('should treat broken redirect as ordinary response (manual)', () => {
    const url = `${base}redirect/no-location`
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.status, 301)
      assert.strictEqual(res.headers.get('location'), null)
    })
  })

  it('should throw a TypeError on an invalid redirect option', () => {
    const url = `${base}redirect/301`
    const options = {
      redirect: 'foobar'
    }
    return fetch(url, options).then(() => {
      assert.fail()
    }, error => {
      assert.ok(error instanceof TypeError)
    })
  })

  it('should set redirected property on response when redirect', () => {
    const url = `${base}redirect/301`
    return fetch(url).then(res => {
      assert.strictEqual(res.redirected, true)
    })
  })

  it('should not set redirected property on response without redirect', () => {
    const url = `${base}hello`
    return fetch(url).then(res => {
      assert.strictEqual(res.redirected, false)
    })
  })

  it('should handle client-error response', () => {
    const url = `${base}error/400`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      assert.strictEqual(res.status, 400)
      assert.strictEqual(res.statusText, 'Bad Request')
      assert.strictEqual(res.ok, false)
      return res.text().then(result => {
        assert.strictEqual(res.bodyUsed, true)
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'client error')
      })
    })
  })

  it('should handle server-error response', () => {
    const url = `${base}error/500`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      assert.strictEqual(res.status, 500)
      assert.strictEqual(res.statusText, 'Internal Server Error')
      assert.strictEqual(res.ok, false)
      return res.text().then(result => {
        assert.strictEqual(res.bodyUsed, true)
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'server error')
      })
    })
  })

  it('should handle network-error response', () => {
    const url = `${base}error/reset`
    return assert.rejects(fetch(url), new TypeError('fetch failed'))
  })

  it('should handle network-error partial response', () => {
    const url = `${base}error/premature`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.ok, true)
      return assert.rejects(() => res.text(), new TypeError('terminated'))
    })
  })

  it('should handle network-error in chunked response async iterator', () => {
    const url = `${base}error/premature/chunked`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.ok, true)

      const read = async body => {
        const chunks = []
        for await (const chunk of body) {
          chunks.push(chunk)
        }

        return chunks
      }

      return assert.rejects(read(res.body), new TypeError('terminated'))
    })
  })

  it('should handle network-error in chunked response in consumeBody', () => {
    const url = `${base}error/premature/chunked`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.ok, true)

      return assert.rejects(res.text(), new TypeError('terminated'))
    })
  })

  it('should handle DNS-error response', () => {
    const url = 'http://domain.invalid'
    return assert.rejects(fetch(url), new TypeError('fetch failed'))
  })

  // TODO: Should we pass through the error message?
  it('should reject invalid json response', () => {
    const url = `${base}error/json`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'application/json')
      return assert.rejects(res.json(), SyntaxError)
    })
  })

  it('should handle response with no status text', () => {
    const url = `${base}no-status-text`
    return fetch(url).then(res => {
      assert.strictEqual(res.statusText, '')
    })
  })

  it('should handle no content response', () => {
    const url = `${base}no-content`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 204)
      assert.strictEqual(res.statusText, 'No Content')
      assert.strictEqual(res.ok, true)
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '')
      })
    })
  })

  // TODO: Should we pass through the error message?
  it('should reject when trying to parse no content response as json', () => {
    const url = `${base}no-content`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 204)
      assert.strictEqual(res.statusText, 'No Content')
      assert.strictEqual(res.ok, true)
      return assert.rejects(res.json(), new SyntaxError('Unexpected end of JSON input'))
    })
  })

  it('should handle no content response with gzip encoding', () => {
    const url = `${base}no-content/gzip`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 204)
      assert.strictEqual(res.statusText, 'No Content')
      assert.strictEqual(res.headers.get('content-encoding'), 'gzip')
      assert.strictEqual(res.ok, true)
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '')
      })
    })
  })

  it('should handle not modified response', () => {
    const url = `${base}not-modified`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 304)
      assert.strictEqual(res.statusText, 'Not Modified')
      assert.strictEqual(res.ok, false)
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '')
      })
    })
  })

  it('should handle not modified response with gzip encoding', () => {
    const url = `${base}not-modified/gzip`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 304)
      assert.strictEqual(res.statusText, 'Not Modified')
      assert.strictEqual(res.headers.get('content-encoding'), 'gzip')
      assert.strictEqual(res.ok, false)
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '')
      })
    })
  })

  it('should decompress gzip response', () => {
    const url = `${base}gzip`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'hello world')
      })
    })
  })

  it('should decompress slightly invalid gzip response', async () => {
    const url = `${base}gzip-truncated`
    const res = await fetch(url)
    assert.strictEqual(res.headers.get('content-type'), 'text/plain')
    const result = await res.text()
    assert.strictEqual(typeof result, 'string')
    assert.strictEqual(result, 'hello world')
  })

  it('should decompress deflate response', () => {
    const url = `${base}deflate`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'hello world')
      })
    })
  })

  it('should decompress deflate raw response from old apache server', () => {
    const url = `${base}deflate-raw`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'hello world')
      })
    })
  })

  it('should decompress brotli response', function () {
    if (typeof zlib.createBrotliDecompress !== 'function') {
      this.skip()
    }

    const url = `${base}brotli`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'hello world')
      })
    })
  })

  it('should handle no content response with brotli encoding', function () {
    if (typeof zlib.createBrotliDecompress !== 'function') {
      this.skip()
    }

    const url = `${base}no-content/brotli`
    return fetch(url).then(res => {
      assert.strictEqual(res.status, 204)
      assert.strictEqual(res.statusText, 'No Content')
      assert.strictEqual(res.headers.get('content-encoding'), 'br')
      assert.strictEqual(res.ok, true)
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, '')
      })
    })
  })

  it('should skip decompression if unsupported', () => {
    const url = `${base}sdch`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'fake sdch string')
      })
    })
  })

  it('should skip decompression if unsupported codings', () => {
    const url = `${base}multiunsupported`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'multiunsupported')
      })
    })
  })

  it('should decompress multiple coding', () => {
    const url = `${base}multisupported`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(result => {
        assert.strictEqual(typeof result, 'string')
        assert.strictEqual(result, 'hello world')
      })
    })
  })

  it('should reject if response compression is invalid', () => {
    const url = `${base}invalid-content-encoding`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return assert.rejects(res.text(), new TypeError('terminated'))
    })
  })

  it('should handle errors on the body stream even if it is not used', done => {
    const url = `${base}invalid-content-encoding`
    fetch(url)
      .then(res => {
        assert.strictEqual(res.status, 200)
      })
      .catch(() => { })
      .then(new Promise((resolve) => {
        // Wait a few ms to see if an uncaught error occurs
        setTimeout(() => {
          resolve()
        }, 20)
      }))
  })

  it('should collect handled errors on the body stream to reject if the body is used later', () => {
    const url = `${base}invalid-content-encoding`
    return fetch(url).then(delay(20)).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return assert.rejects(res.text(), new TypeError('terminated'))
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
      assert.strictEqual(res.headers['accept-encoding'], 'gzip')
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

      return Promise.all(fetches.map(async fetched => {
        try {
          await fetched
          assert.fail('should have thrown')
        } catch (error) {
          assert.ok(error instanceof Error)
          assert.strictEqual(error.name, 'AbortError')
        }
      }))
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

      return Promise.all(fetches.map(async fetched => {
        try {
          await fetched
          assert.fail('should have thrown')
        } catch (error) {
          assert.ok(error instanceof Error)
          assert.strictEqual(error.name, 'AbortError')
        }
      }))
    })

    it('should reject immediately if signal has already been aborted', async () => {
      const url = `${base}timeout`
      const options = {
        signal: controller.signal
      }
      controller.abort()
      const fetched = fetch(url, options)

      try {
        await fetched
        assert.fail('should have thrown')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'AbortError')
      }
    })

    it('should allow redirects to be aborted', async () => {
      const request = new Request(`${base}redirect/slow`, {
        signal: controller.signal
      })
      setTimeout(() => {
        controller.abort()
      }, 20)

      try {
        await fetch(request)
        assert.fail('should have thrown')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'AbortError')
      }
    })

    it('should allow redirected response body to be aborted', async () => {
      const request = new Request(`${base}redirect/slow-stream`, {
        signal: controller.signal
      })
      const fetched = fetch(request).then(res => {
        assert.strictEqual(res.headers.get('content-type'), 'text/plain')
        const result = res.text()
        controller.abort()
        return result
      })

      try {
        await fetched
        assert.fail('should have thrown')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'AbortError')
      }
    })

    it('should reject response body with AbortError when aborted before stream has been read completely', async () => {
      const response = await fetch(
        `${base}slow`,
        { signal: controller.signal }
      )

      const promise = response.text()
      controller.abort()

      try {
        await promise
        assert.fail('should have thrown')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'AbortError')
      }
    })

    it('should reject response body methods immediately with AbortError when aborted before stream is disturbed', async () => {
      const response = await fetch(
        `${base}slow`,
        { signal: controller.signal }
      )

      controller.abort()
      const promise = response.text()
      try {
        await promise
        assert.fail('should have thrown')
      } catch (error) {
        assert.ok(error instanceof Error)
        assert.strictEqual(error.name, 'AbortError')
      }
    })
  })

  it('should throw a TypeError if a signal is not of type AbortSignal or EventTarget', () => {
    return Promise.all([
      assert.rejects(fetch(`${base}inspect`, { signal: {} }), new TypeError('RequestInit: Expected signal ("{}") to be an instance of AbortSignal.')),
      assert.rejects(fetch(`${base}inspect`, { signal: '' }), new TypeError('RequestInit: Expected signal ("""") to be an instance of AbortSignal.')),
      assert.rejects(fetch(`${base}inspect`, { signal: Object.create(null) }), new TypeError('RequestInit: Expected signal ("[Object: null prototype] {}") to be an instance of AbortSignal.'))
    ])
  })

  it('should gracefully handle a null signal', () => {
    return fetch(`${base}hello`, { signal: null }).then(res => {
      return assert.strictEqual(res.ok, true)
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
      assert.strictEqual(res.headers['user-agent'], 'faked')
    })
  })

  it('should set default Accept header', () => {
    const url = `${base}inspect`
    fetch(url).then(res => res.json()).then(res => {
      assert.strictEqual(res.headers.accept, '*/*')
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
      assert.strictEqual(res.headers.accept, 'application/json')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '0')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], 'text/plain;charset=UTF-8')
      assert.strictEqual(res.headers['content-length'], '3')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '3')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'Hello, world!\n')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '14')
    })
  })

  it('should allow POST request with ArrayBuffer body from a VM context', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new VMUint8Array(Buffer.from('Hello, world!\n')).buffer
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'Hello, world!\n')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '14')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'Hello, world!\n')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '14')
    })
  })

  it('should allow POST request with ArrayBufferView (BigUint64Array) body', () => {
    const encoder = new TextEncoder()
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new BigUint64Array(encoder.encode('0123456789abcdef').buffer)
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, '0123456789abcdef')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '16')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'Hello, world!\n')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '14')
    })
  })

  it('should allow POST request with ArrayBufferView (Uint8Array) body from a VM context', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: new VMUint8Array(Buffer.from('Hello, world!\n'))
    }
    return fetch(url, options).then(res => res.json()).then(res => {
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'Hello, world!\n')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '14')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'world!')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '6')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      // assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], '3')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-type'], 'text/plain;charset=utf-8')
      assert.strictEqual(res.headers['content-length'], '3')
    })
  })

  it('should allow POST request with readable stream as body', () => {
    const url = `${base}inspect`
    const options = {
      method: 'POST',
      body: stream.Readable.from('a=1'),
      duplex: 'half'
    }
    return fetch(url, options).then(res => {
      return res.json()
    }).then(res => {
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], 'chunked')
      assert.strictEqual(res.headers['content-type'], undefined)
      assert.strictEqual(res.headers['content-length'], undefined)
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.body, '[object Object]')
      assert.strictEqual(res.headers['content-type'], 'text/plain;charset=UTF-8')
      assert.strictEqual(res.headers['content-length'], '15')
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
      assert.strictEqual(res.method, 'POST')
      assert.ok(res.headers['content-type'].startsWith('multipart/form-data; boundary='))
      assert.strictEqual(res.body, 'a=1')
    })
  })

  it('constructing a Response with URLSearchParams as body should have a Content-Type', () => {
    const parameters = new URLSearchParams()
    const res = new Response(parameters)
    res.headers.get('Content-Type')
    assert.strictEqual(res.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
  })

  it('constructing a Request with URLSearchParams as body should have a Content-Type', () => {
    const parameters = new URLSearchParams()
    const request = new Request(base, { method: 'POST', body: parameters })
    assert.strictEqual(request.headers.get('Content-Type'), 'application/x-www-form-urlencoded;charset=UTF-8')
  })

  it('Reading a body with URLSearchParams should echo back the result', () => {
    const parameters = new URLSearchParams()
    parameters.append('a', '1')
    return new Response(parameters).text().then(text => {
      assert.strictEqual(text, 'a=1')
    })
  })

  // Body should be cloned...
  it('constructing a Request/Response with URLSearchParams and mutating it should not affected body', () => {
    const parameters = new URLSearchParams()
    const request = new Request(`${base}inspect`, { method: 'POST', body: parameters })
    parameters.append('a', '1')
    return request.text().then(text => {
      assert.strictEqual(text, '')
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
      assert.strictEqual(res.headers['content-length'], '3')
      assert.strictEqual(res.body, 'a=1')
    })
  })

  it('should still recognize URLSearchParams when extended', () => {
    class CustomSearchParameters extends URLSearchParams { }
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
      assert.strictEqual(res.method, 'POST')
      assert.strictEqual(res.headers['content-type'], 'application/x-www-form-urlencoded;charset=UTF-8')
      assert.strictEqual(res.headers['content-length'], '3')
      assert.strictEqual(res.body, 'a=1')
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
      assert.strictEqual(res.method, 'PUT')
      assert.strictEqual(res.body, 'a=1')
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
      assert.strictEqual(res.method, 'DELETE')
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
      assert.strictEqual(res.method, 'DELETE')
      assert.strictEqual(res.body, 'a=1')
      assert.strictEqual(res.headers['transfer-encoding'], undefined)
      assert.strictEqual(res.headers['content-length'], '3')
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
      assert.strictEqual(res.method, 'PATCH')
      assert.strictEqual(res.body, 'a=1')
    })
  })

  it('should allow HEAD request', () => {
    const url = `${base}hello`
    const options = {
      method: 'HEAD'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.statusText, 'OK')
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      // assert.ok(res.body instanceof stream.Transform)
      return res.text()
    }).then(text => {
      assert.strictEqual(text, '')
    })
  })

  it('should allow HEAD request with content-encoding header', () => {
    const url = `${base}error/404`
    const options = {
      method: 'HEAD'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.status, 404)
      assert.strictEqual(res.headers.get('content-encoding'), 'gzip')
      return res.text()
    }).then(text => {
      assert.strictEqual(text, '')
    })
  })

  it('should allow OPTIONS request', () => {
    const url = `${base}options`
    const options = {
      method: 'OPTIONS'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.statusText, 'OK')
      assert.strictEqual(res.headers.get('allow'), 'GET, HEAD, OPTIONS')
      // assert.ok(res.body instanceof stream.Transform)
    })
  })

  it('should reject decoding body twice', () => {
    const url = `${base}plain`
    return fetch(url).then(res => {
      assert.strictEqual(res.headers.get('content-type'), 'text/plain')
      return res.text().then(() => {
        assert.strictEqual(res.bodyUsed, true)
        return assert.rejects(res.text(), new TypeError('Body is unusable: Body has already been read'))
      })
    })
  })

  it('should allow cloning a json response and log it as text response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return Promise.all([res.json(), r1.text()]).then(results => {
        assert.deepStrictEqual(results[0], { name: 'value' })
        assert.strictEqual(results[1], '{"name":"value"}')
      })
    })
  })

  it('should allow cloning a json response, and then log it as text response', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return res.json().then(result => {
        assert.deepStrictEqual(result, { name: 'value' })
        return r1.text().then(result => {
          assert.strictEqual(result, '{"name":"value"}')
        })
      })
    })
  })

  it('should allow cloning a json response, first log as text response, then return json object', () => {
    const url = `${base}json`
    return fetch(url).then(res => {
      const r1 = res.clone()
      return r1.text().then(result => {
        assert.strictEqual(result, '{"name":"value"}')
        return res.json().then(result => {
          assert.deepStrictEqual(result, { name: 'value' })
        })
      })
    })
  })

  it('should not allow cloning a response after its been used', () => {
    const url = `${base}hello`
    return fetch(url).then(res =>
      res.text().then(() => {
        assert.throws(() => {
          res.clone()
        }, new TypeError('Response.clone: Body has already been consumed.'))
      })
    )
  })

  /* global expect */

  // TODO: fix test.
  it.skip('should timeout on cloning response without consuming one of the streams when the second packet size is equal default highWaterMark', { timeout: 300 }, function () {
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

  // TODO: fix test.
  it.skip('should timeout on cloning response without consuming one of the streams when the second packet size is equal custom highWaterMark', { timeout: 300 }, function () {
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 10
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize))
    })
    return expect(
      fetch(url, { highWaterMark: 10 }).then(res => res.clone().buffer())
    ).to.timeout
  })

  // TODO: fix test.
  it.skip('should not timeout on cloning response without consuming one of the streams when the second packet size is less than default highWaterMark', { timeout: 300 }, async function () {
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 16 * 1024 // = defaultHighWaterMark
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize - 1))
    })
    return expect(
      fetch(url).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  // TODO: fix test.
  it.skip('should not timeout on cloning response without consuming one of the streams when the second packet size is less than custom highWaterMark', { timeout: 300 }, function () {
    const url = local.mockState(res => {
      const firstPacketMaxSize = 65438
      const secondPacketSize = 10
      res.end(crypto.randomBytes(firstPacketMaxSize + secondPacketSize - 1))
    })
    return expect(
      fetch(url, { highWaterMark: 10 }).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  // TODO: fix test.
  it.skip('should not timeout on cloning response without consuming one of the streams when the response size is double the custom large highWaterMark - 1', { timeout: 300 }, function () {
    const url = local.mockState(res => {
      res.end(crypto.randomBytes((2 * 512 * 1024) - 1))
    })
    return expect(
      fetch(url, { highWaterMark: 512 * 1024 }).then(res => res.clone().buffer())
    ).not.to.timeout
  })

  // TODO: fix test.
  it.skip('should allow get all responses of a header', () => {
    const url = `${base}cookie`
    return fetch(url).then(res => {
      const expected = 'a=1, b=1'
      assert.strictEqual(res.headers.get('set-cookie'), expected)
      assert.strictEqual(res.headers.get('Set-Cookie'), expected)
    })
  })

  it('should support fetch with Request instance', () => {
    const url = `${base}hello`
    const request = new Request(url)
    return fetch(request).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should support fetch with Node.js URL object', () => {
    const url = `${base}hello`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should support fetch with WHATWG URL object', () => {
    const url = `${base}hello`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.status, 200)
    })
  })

  it('if params are given, do not modify anything', () => {
    const url = `${base}question?a=1`
    const urlObject = new URL(url)
    const request = new Request(urlObject)
    return fetch(request).then(res => {
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.status, 200)
    })
  })

  it('should support reading blob as text', () => {
    return new Response('hello')
      .blob()
      .then(blob => blob.text())
      .then(body => {
        assert.strictEqual(body, 'hello')
      })
  })

  it('should support reading blob as arrayBuffer', () => {
    return new Response('hello')
      .blob()
      .then(blob => blob.arrayBuffer())
      .then(ab => {
        const string = String.fromCharCode.apply(null, new Uint8Array(ab))
        assert.strictEqual(string, 'hello')
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
      assert.strictEqual(body, 'world')
      assert.strictEqual(headers['content-type'], type)
      assert.strictEqual(headers['content-length'], String(length))
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
      assert.strictEqual(body.method, 'GET')
      assert.strictEqual(body.headers.a, '2')
    })
  })

  it('should support http request', { timeout: 5000 }, async function (t) {
    t = tspl(t, { plan: 2 })
    const server = createServer((req, res) => {
      res.end()
    })
    after(() => server.close())
    server.listen(0, () => {
      const url = `http://localhost:${server.address().port}`
      const options = {
        method: 'HEAD'
      }
      fetch(url, options).then(res => {
        t.strictEqual(res.status, 200)
        t.strictEqual(res.ok, true)
      })
    })
    await t.completed
  })

  it('should encode URLs as UTF-8', async () => {
    const url = `${base}möbius`
    const res = await fetch(url)
    assert.strictEqual(res.url, `${base}m%C3%B6bius`)
  })

  it('should allow manual redirect handling', { timeout: 5000 }, function () {
    const url = `${base}redirect/302`
    const options = {
      redirect: 'manual'
    }
    return fetch(url, options).then(res => {
      assert.strictEqual(res.status, 302)
      assert.strictEqual(res.url, url)
      assert.strictEqual(res.type, 'basic')
      assert.strictEqual(res.headers.get('Location'), '/inspect')
      assert.strictEqual(res.ok, false)
    })
  })
})
