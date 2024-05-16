/* globals AbortController */

'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const {
  Request,
  Headers,
  fetch
} = require('../../')
const { fromInnerRequest, makeRequest } = require('../../lib/web/fetch/request')
const {
  Blob: ThirdPartyBlob,
  FormData: ThirdPartyFormData
} = require('formdata-node')
const { kState, kSignal, kHeaders } = require('../../lib/web/fetch/symbols')
const { getHeadersGuard, getHeadersList } = require('../../lib/web/fetch/headers')

const hasSignalReason = 'reason' in AbortSignal.prototype

test('arg validation', async (t) => {
  // constructor
  assert.throws(() => {
    // eslint-disable-next-line
    new Request()
  }, TypeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', 0)
  }, TypeError)
  assert.throws(() => {
    const url = new URL('http://asd')
    url.password = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  assert.throws(() => {
    const url = new URL('http://asd')
    url.username = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  assert.doesNotThrow(() => {
    // eslint-disable-next-line
    new Request('http://asd', undefined)
  }, TypeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: {}
    })
  }, TypeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: 1
    })
  }, TypeError)
  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'navigate'
    })
  })

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      referrerPolicy: 'agjhagna'
    })
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'agjhagna'
    })
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      credentials: 'agjhagna'
    })
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      cache: 'agjhagna'
    })
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'agjhagnaöööö'
    })
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'TRACE'
    })
  }, TypeError)

  assert.throws(() => {
    Request.prototype.destination.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.referrer.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.referrerPolicy.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.mode.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.credentials.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.cache.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.redirect.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.integrity.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.keepalive.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.isReloadNavigation.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.isHistoryNavigation.toString()
  }, TypeError)

  assert.throws(() => {
    Request.prototype.signal.toString()
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.body
  }, TypeError)

  assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.bodyUsed
  }, TypeError)

  assert.throws(() => {
    Request.prototype.clone.call(null)
  }, TypeError)

  assert.doesNotThrow(() => {
    Request.prototype[Symbol.toStringTag].charAt(0)
  })

  for (const method of [
    'text',
    'json',
    'arrayBuffer',
    'blob',
    'formData'
  ]) {
    await assert.rejects(async () => {
      await new Request('http://localhost')[method].call({
        blob () {
          return {
            text () {
              return Promise.resolve('emulating this')
            }
          }
        }
      })
    }, TypeError)
  }
})

test('undefined window', () => {
  assert.doesNotThrow(() => new Request('http://asd', { window: undefined }))
})

test('undefined body', () => {
  const req = new Request('http://asd', { body: undefined })
  assert.strictEqual(req.body, null)
})

test('undefined method', () => {
  const req = new Request('http://asd', { method: undefined })
  assert.strictEqual(req.method, 'GET')
})

test('undefined headers', () => {
  const req = new Request('http://asd', { headers: undefined })
  assert.strictEqual([...req.headers.entries()].length, 0)
})

test('undefined referrer', () => {
  const req = new Request('http://asd', { referrer: undefined })
  assert.strictEqual(req.referrer, 'about:client')
})

test('undefined referrerPolicy', () => {
  const req = new Request('http://asd', { referrerPolicy: undefined })
  assert.strictEqual(req.referrerPolicy, '')
})

test('undefined mode', () => {
  const req = new Request('http://asd', { mode: undefined })
  assert.strictEqual(req.mode, 'cors')
})

test('undefined credentials', () => {
  const req = new Request('http://asd', { credentials: undefined })
  assert.strictEqual(req.credentials, 'same-origin')
})

test('undefined cache', () => {
  const req = new Request('http://asd', { cache: undefined })
  assert.strictEqual(req.cache, 'default')
})

test('undefined redirect', () => {
  const req = new Request('http://asd', { redirect: undefined })
  assert.strictEqual(req.redirect, 'follow')
})

test('undefined keepalive', () => {
  const req = new Request('http://asd', { keepalive: undefined })
  assert.strictEqual(req.keepalive, false)
})

test('undefined integrity', () => {
  const req = new Request('http://asd', { integrity: undefined })
  assert.strictEqual(req.integrity, '')
})

test('null integrity', () => {
  const req = new Request('http://asd', { integrity: null })
  assert.strictEqual(req.integrity, 'null')
})

test('undefined signal', () => {
  const req = new Request('http://asd', { signal: undefined })
  assert.strictEqual(req.signal.aborted, false)
})

test('pre aborted signal', () => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal })
  assert.strictEqual(req.signal.aborted, true)
  if (hasSignalReason) {
    assert.strictEqual(req.signal.reason, 'gwak')
  }
})

test('post aborted signal', (t) => {
  const { strictEqual, ok } = tspl(t, { plan: 2 })

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal })
  strictEqual(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    if (hasSignalReason) {
      strictEqual(req.signal.reason, 'gwak')
    } else {
      ok(true)
    }
  }, { once: true })
  ac.abort('gwak')
})

test('pre aborted signal cloned', () => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  assert.strictEqual(req.signal.aborted, true)
  if (hasSignalReason) {
    assert.strictEqual(req.signal.reason, 'gwak')
  }
})

test('URLSearchParams body with Headers object - issue #1407', async () => {
  const body = new URLSearchParams({
    abc: 123
  })

  const request = new Request(
    'http://localhost',
    {
      method: 'POST',
      body,
      headers: {
        Authorization: 'test'
      }
    }
  )

  assert.strictEqual(request.headers.get('content-type'), 'application/x-www-form-urlencoded;charset=UTF-8')
  assert.strictEqual(request.headers.get('authorization'), 'test')
  assert.strictEqual(await request.text(), 'abc=123')
})

test('post aborted signal cloned', (t) => {
  const { strictEqual, ok } = tspl(t, { plan: 2 })

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  strictEqual(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    if (hasSignalReason) {
      strictEqual(req.signal.reason, 'gwak')
    } else {
      ok(true)
    }
  }, { once: true })
  ac.abort('gwak')
})

test('Passing headers in init', async (t) => {
  // https://github.com/nodejs/undici/issues/1400
  await t.test('Headers instance', () => {
    const req = new Request('http://localhost', {
      headers: new Headers({ key: 'value' })
    })

    assert.strictEqual(req.headers.get('key'), 'value')
  })

  await t.test('key:value object', () => {
    const req = new Request('http://localhost', {
      headers: { key: 'value' }
    })

    assert.strictEqual(req.headers.get('key'), 'value')
  })

  await t.test('[key, value][]', () => {
    const req = new Request('http://localhost', {
      headers: [['key', 'value']]
    })

    assert.strictEqual(req.headers.get('key'), 'value')
  })
})

test('Symbol.toStringTag', () => {
  const req = new Request('http://localhost')

  assert.strictEqual(req[Symbol.toStringTag], 'Request')
  assert.strictEqual(Request.prototype[Symbol.toStringTag], 'Request')
})

test('invalid RequestInit values', () => {
  /* eslint-disable no-new */
  assert.throws(() => {
    new Request('http://l', { mode: 'CoRs' })
  }, TypeError, 'not exact case = error')

  assert.throws(() => {
    new Request('http://l', { mode: 'random' })
  }, TypeError)

  assert.throws(() => {
    new Request('http://l', { credentials: 'OMIt' })
  }, TypeError, 'not exact case = error')

  assert.throws(() => {
    new Request('http://l', { credentials: 'random' })
  }, TypeError)

  assert.throws(() => {
    new Request('http://l', { cache: 'DeFaULt' })
  }, TypeError, 'not exact case = error')

  assert.throws(() => {
    new Request('http://l', { cache: 'random' })
  }, TypeError)

  assert.throws(() => {
    new Request('http://l', { redirect: 'FOllOW' })
  }, TypeError, 'not exact case = error')

  assert.throws(() => {
    new Request('http://l', { redirect: 'random' })
  }, TypeError)
  /* eslint-enable no-new */
})

test('RequestInit.signal option', async () => {
  assert.throws(() => {
    // eslint-disable-next-line no-new
    new Request('http://asd', {
      signal: true
    })
  }, TypeError)

  await assert.rejects(fetch('http://asd', {
    signal: false
  }), TypeError)
})

test('constructing Request with third party Blob body', async () => {
  const blob = new ThirdPartyBlob(['text'])
  const req = new Request('http://asd', {
    method: 'POST',
    body: blob
  })
  assert.strictEqual(await req.text(), 'text')
})
test('constructing Request with third party FormData body', async () => {
  const form = new ThirdPartyFormData()
  form.set('key', 'value')
  const req = new Request('http://asd', {
    method: 'POST',
    body: form
  })
  const contentType = req.headers.get('content-type').split('=')
  assert.strictEqual(contentType[0], 'multipart/form-data; boundary')
  assert.ok((await req.text()).startsWith(`--${contentType[1]}`))
})

// https://github.com/nodejs/undici/issues/2050
test('set-cookie headers get cleared when passing a Request as first param', () => {
  const req1 = new Request('http://localhost', {
    headers: {
      'set-cookie': 'a=1'
    }
  })

  assert.deepStrictEqual([...req1.headers], [['set-cookie', 'a=1']])
  const req2 = new Request(req1, { headers: {} })
  assert.deepStrictEqual([...req1.headers], [['set-cookie', 'a=1']])
  assert.deepStrictEqual([...req2.headers], [])
  assert.deepStrictEqual(req2.headers.getSetCookie(), [])
})

// https://github.com/nodejs/undici/issues/2124
test('request.referrer', () => {
  for (const referrer of ['about://client', 'about://client:1234']) {
    const request = new Request('http://a', { referrer })

    assert.strictEqual(request.referrer, 'about:client')
  }
})

// https://github.com/nodejs/undici/issues/2445
test('Clone the set-cookie header when Request is passed as the first parameter and no header is passed.', (t) => {
  const request = new Request('http://localhost', { headers: { 'set-cookie': 'A' } })
  const request2 = new Request(request)
  assert.deepStrictEqual([...request.headers], [['set-cookie', 'A']])
  request2.headers.append('set-cookie', 'B')
  assert.deepStrictEqual([...request.headers], [['set-cookie', 'A']])
  assert.strictEqual(request.headers.getSetCookie().join(', '), request.headers.get('set-cookie'))
  assert.strictEqual(request2.headers.getSetCookie().join(', '), request2.headers.get('set-cookie'))
})

// Tests for optimization introduced in https://github.com/nodejs/undici/pull/2456
test('keys to object prototypes method', (t) => {
  const request = new Request('http://localhost', { method: 'hasOwnProperty' })
  assert(typeof request.method === 'string')
})

// https://github.com/nodejs/undici/issues/2465
test('Issue#2465', async (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })
  const request = new Request('http://localhost', { body: new SharedArrayBuffer(0), method: 'POST' })
  strictEqual(await request.text(), '[object SharedArrayBuffer]')
})

test('fromInnerRequest', () => {
  const innerRequest = makeRequest({
    urlList: [new URL('http://asd')]
  })
  const signal = new AbortController().signal
  const request = fromInnerRequest(innerRequest, signal, 'immutable')

  // check property
  assert.strictEqual(request[kState], innerRequest)
  assert.strictEqual(request[kSignal], signal)
  assert.strictEqual(getHeadersList(request[kHeaders]), innerRequest.headersList)
  assert.strictEqual(getHeadersGuard(request[kHeaders]), 'immutable')
})
