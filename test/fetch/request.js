/* globals AbortController */

'use strict'

const { test, teardown } = require('tap')
const {
  Request,
  Headers,
  fetch
} = require('../../')
const {
  Blob: ThirdPartyBlob,
  FormData: ThirdPartyFormData
} = require('formdata-node')

const hasSignalReason = 'reason' in AbortSignal.prototype

test('arg validation', async (t) => {
  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new Request()
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', 0)
  }, TypeError)
  t.throws(() => {
    const url = new URL('http://asd')
    url.password = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  t.throws(() => {
    const url = new URL('http://asd')
    url.username = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  t.doesNotThrow(() => {
    // eslint-disable-next-line
    new Request('http://asd', undefined)
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: {}
    })
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: 1
    })
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'navigate'
    })
  })

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      referrerPolicy: 'agjhagna'
    })
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'agjhagna'
    })
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      credentials: 'agjhagna'
    })
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      cache: 'agjhagna'
    })
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'agjhagnaöööö'
    })
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'TRACE'
    })
  }, TypeError)

  t.throws(() => {
    Request.prototype.destination.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.referrer.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.referrerPolicy.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.mode.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.credentials.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.cache.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.redirect.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.integrity.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.keepalive.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.isReloadNavigation.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.isHistoryNavigation.toString()
  }, TypeError)

  t.throws(() => {
    Request.prototype.signal.toString()
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.body
  }, TypeError)

  t.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.bodyUsed
  }, TypeError)

  t.throws(() => {
    Request.prototype.clone.call(null)
  }, TypeError)

  t.doesNotThrow(() => {
    Request.prototype[Symbol.toStringTag].charAt(0)
  })

  for (const method of [
    'text',
    'json',
    'arrayBuffer',
    'blob',
    'formData'
  ]) {
    await t.rejects(async () => {
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

  t.end()
})

test('undefined window', t => {
  t.doesNotThrow(() => new Request('http://asd', { window: undefined }))
  t.end()
})

test('undefined body', t => {
  const req = new Request('http://asd', { body: undefined })
  t.equal(req.body, null)
  t.end()
})

test('undefined method', t => {
  const req = new Request('http://asd', { method: undefined })
  t.equal(req.method, 'GET')
  t.end()
})

test('undefined headers', t => {
  const req = new Request('http://asd', { headers: undefined })
  t.equal([...req.headers.entries()].length, 0)
  t.end()
})

test('undefined referrer', t => {
  const req = new Request('http://asd', { referrer: undefined })
  t.equal(req.referrer, 'about:client')
  t.end()
})

test('undefined referrerPolicy', t => {
  const req = new Request('http://asd', { referrerPolicy: undefined })
  t.equal(req.referrerPolicy, '')
  t.end()
})

test('undefined mode', t => {
  const req = new Request('http://asd', { mode: undefined })
  t.equal(req.mode, 'cors')
  t.end()
})

test('undefined credentials', t => {
  const req = new Request('http://asd', { credentials: undefined })
  t.equal(req.credentials, 'same-origin')
  t.end()
})

test('undefined cache', t => {
  const req = new Request('http://asd', { cache: undefined })
  t.equal(req.cache, 'default')
  t.end()
})

test('undefined redirect', t => {
  const req = new Request('http://asd', { redirect: undefined })
  t.equal(req.redirect, 'follow')
  t.end()
})

test('undefined keepalive', t => {
  const req = new Request('http://asd', { keepalive: undefined })
  t.equal(req.keepalive, false)
  t.end()
})

test('undefined integrity', t => {
  const req = new Request('http://asd', { integrity: undefined })
  t.equal(req.integrity, '')
  t.end()
})

test('null integrity', t => {
  const req = new Request('http://asd', { integrity: null })
  t.equal(req.integrity, 'null')
  t.end()
})

test('undefined signal', t => {
  const req = new Request('http://asd', { signal: undefined })
  t.equal(req.signal.aborted, false)
  t.end()
})

test('pre aborted signal', t => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal })
  t.equal(req.signal.aborted, true)
  if (hasSignalReason) {
    t.equal(req.signal.reason, 'gwak')
  }
  t.end()
})

test('post aborted signal', t => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal })
  t.equal(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    if (hasSignalReason) {
      t.equal(req.signal.reason, 'gwak')
    } else {
      t.pass()
    }
  }, { once: true })
  ac.abort('gwak')
})

test('pre aborted signal cloned', t => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.equal(req.signal.aborted, true)
  if (hasSignalReason) {
    t.equal(req.signal.reason, 'gwak')
  }
  t.end()
})

test('URLSearchParams body with Headers object - issue #1407', async (t) => {
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

  t.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded;charset=UTF-8')
  t.equal(request.headers.get('authorization'), 'test')
  t.equal(await request.text(), 'abc=123')
})

test('post aborted signal cloned', t => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.equal(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    if (hasSignalReason) {
      t.equal(req.signal.reason, 'gwak')
    } else {
      t.pass()
    }
  }, { once: true })
  ac.abort('gwak')
})

test('Passing headers in init', (t) => {
  // https://github.com/nodejs/undici/issues/1400
  t.test('Headers instance', (t) => {
    const req = new Request('http://localhost', {
      headers: new Headers({ key: 'value' })
    })

    t.equal(req.headers.get('key'), 'value')
    t.end()
  })

  t.test('key:value object', (t) => {
    const req = new Request('http://localhost', {
      headers: { key: 'value' }
    })

    t.equal(req.headers.get('key'), 'value')
    t.end()
  })

  t.test('[key, value][]', (t) => {
    const req = new Request('http://localhost', {
      headers: [['key', 'value']]
    })

    t.equal(req.headers.get('key'), 'value')
    t.end()
  })

  t.end()
})

test('Symbol.toStringTag', (t) => {
  const req = new Request('http://localhost')

  t.equal(req[Symbol.toStringTag], 'Request')
  t.equal(Request.prototype[Symbol.toStringTag], 'Request')
  t.end()
})

test('invalid RequestInit values', (t) => {
  /* eslint-disable no-new */
  t.throws(() => {
    new Request('http://l', { mode: 'CoRs' })
  }, TypeError, 'not exact case = error')

  t.throws(() => {
    new Request('http://l', { mode: 'random' })
  }, TypeError)

  t.throws(() => {
    new Request('http://l', { credentials: 'OMIt' })
  }, TypeError, 'not exact case = error')

  t.throws(() => {
    new Request('http://l', { credentials: 'random' })
  }, TypeError)

  t.throws(() => {
    new Request('http://l', { cache: 'DeFaULt' })
  }, TypeError, 'not exact case = error')

  t.throws(() => {
    new Request('http://l', { cache: 'random' })
  }, TypeError)

  t.throws(() => {
    new Request('http://l', { redirect: 'FOllOW' })
  }, TypeError, 'not exact case = error')

  t.throws(() => {
    new Request('http://l', { redirect: 'random' })
  }, TypeError)
  /* eslint-enable no-new */

  t.end()
})

test('RequestInit.signal option', async (t) => {
  t.throws(() => {
    // eslint-disable-next-line no-new
    new Request('http://asd', {
      signal: true
    })
  }, TypeError)

  await t.rejects(fetch('http://asd', {
    signal: false
  }), TypeError)
})

test('constructing Request with third party Blob body', async (t) => {
  const blob = new ThirdPartyBlob(['text'])
  const req = new Request('http://asd', {
    method: 'POST',
    body: blob
  })
  t.equal(await req.text(), 'text')
})
test('constructing Request with third party FormData body', async (t) => {
  const form = new ThirdPartyFormData()
  form.set('key', 'value')
  const req = new Request('http://asd', {
    method: 'POST',
    body: form
  })
  const contentType = req.headers.get('content-type').split('=')
  t.equal(contentType[0], 'multipart/form-data; boundary')
  t.ok((await req.text()).startsWith(`--${contentType[1]}`))
})

// https://github.com/nodejs/undici/issues/2050
test('set-cookie headers get cleared when passing a Request as first param', (t) => {
  const req1 = new Request('http://localhost', {
    headers: {
      'set-cookie': 'a=1'
    }
  })

  t.same([...req1.headers], [['set-cookie', 'a=1']])
  const req2 = new Request(req1, { headers: {} })

  t.same([...req2.headers], [])
  t.same(req2.headers.getSetCookie(), [])
  t.end()
})

// https://github.com/nodejs/undici/issues/2124
test('request.referrer', (t) => {
  for (const referrer of ['about://client', 'about://client:1234']) {
    const request = new Request('http://a', { referrer })

    t.equal(request.referrer, 'about:client')
  }

  t.end()
})

teardown(() => process.exit())
