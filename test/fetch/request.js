/* globals AbortController */

'use strict'

const { setMaxListeners } = require('node:events')
const { test } = require('node:test')
const {
  Request,
  Headers,
  fetch
} = require('../../')

async function forceGarbageCollection (iterations = 50) {
  for (let i = 0; i < iterations; ++i) {
    const garbage = Array.from({ length: 1000 }, () => ({ value: Math.random() }))
    if (garbage.length === 0) {
      throw new Error('unreachable')
    }
    global.gc()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function waitForAbort (signal, timeout = 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false)
    }, timeout)

    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve(true)
    }, { once: true })
  })
}

test('arg validation', async (t) => {
  // constructor
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request()
  }, TypeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', 0)
  }, TypeError)
  t.assert.throws(() => {
    const url = new URL('http://asd')
    url.password = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  t.assert.throws(() => {
    const url = new URL('http://asd')
    url.username = 'asd'
    // eslint-disable-next-line
    new Request(url)
  }, TypeError)
  t.assert.doesNotThrow(() => {
    // eslint-disable-next-line
    new Request('http://asd', undefined)
  }, TypeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: {}
    })
  }, TypeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      window: 1
    })
  }, TypeError)
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'navigate'
    })
  })

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      referrerPolicy: 'agjhagna'
    })
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      mode: 'agjhagna'
    })
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      credentials: 'agjhagna'
    })
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      cache: 'agjhagna'
    })
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'agjhagnaöööö'
    })
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line
    new Request('http://asd', {
      method: 'TRACE'
    })
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.destination.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.referrer.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.referrerPolicy.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.mode.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.credentials.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.cache.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.redirect.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.integrity.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.keepalive.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.isReloadNavigation.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.isHistoryNavigation.toString()
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.signal.toString()
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.body
  }, TypeError)

  t.assert.throws(() => {
    // eslint-disable-next-line no-unused-expressions
    Request.prototype.bodyUsed
  }, TypeError)

  t.assert.throws(() => {
    Request.prototype.clone.call(null)
  }, TypeError)

  t.assert.doesNotThrow(() => {
    Request.prototype[Symbol.toStringTag].charAt(0)
  })

  for (const method of [
    'text',
    'json',
    'arrayBuffer',
    'blob',
    'formData'
  ]) {
    await t.assert.rejects(async () => {
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

test('undefined window', (t) => {
  t.assert.doesNotThrow(() => new Request('http://asd', { window: undefined }))
})

test('undefined body', (t) => {
  const req = new Request('http://asd', { body: undefined })
  t.assert.strictEqual(req.body, null)
})

test('undefined method', (t) => {
  const req = new Request('http://asd', { method: undefined })
  t.assert.strictEqual(req.method, 'GET')
})

test('undefined headers', (t) => {
  const req = new Request('http://asd', { headers: undefined })
  t.assert.strictEqual([...req.headers.entries()].length, 0)
})

test('undefined referrer', (t) => {
  const req = new Request('http://asd', { referrer: undefined })
  t.assert.strictEqual(req.referrer, 'about:client')
})

test('undefined referrerPolicy', (t) => {
  const req = new Request('http://asd', { referrerPolicy: undefined })
  t.assert.strictEqual(req.referrerPolicy, '')
})

test('undefined mode', (t) => {
  const req = new Request('http://asd', { mode: undefined })
  t.assert.strictEqual(req.mode, 'cors')
})

test('undefined credentials', (t) => {
  const req = new Request('http://asd', { credentials: undefined })
  t.assert.strictEqual(req.credentials, 'same-origin')
})

test('undefined cache', (t) => {
  const req = new Request('http://asd', { cache: undefined })
  t.assert.strictEqual(req.cache, 'default')
})

test('undefined redirect', (t) => {
  const req = new Request('http://asd', { redirect: undefined })
  t.assert.strictEqual(req.redirect, 'follow')
})

test('undefined keepalive', (t) => {
  const req = new Request('http://asd', { keepalive: undefined })
  t.assert.strictEqual(req.keepalive, false)
})

test('undefined integrity', (t) => {
  const req = new Request('http://asd', { integrity: undefined })
  t.assert.strictEqual(req.integrity, '')
})

test('null integrity', (t) => {
  const req = new Request('http://asd', { integrity: null })
  t.assert.strictEqual(req.integrity, 'null')
})

test('undefined signal', (t) => {
  const req = new Request('http://asd', { signal: undefined })
  t.assert.strictEqual(req.signal.aborted, false)
})

test('pre aborted signal', (t) => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal })
  t.assert.strictEqual(req.signal.aborted, true)
  t.assert.strictEqual(req.signal.reason, 'gwak')
})

test('post aborted signal', (t) => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal })
  t.assert.strictEqual(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    t.assert.strictEqual(req.signal.reason, 'gwak')
  }, { once: true })
  ac.abort('gwak')
})

test('pre aborted signal cloned', (t) => {
  const ac = new AbortController()
  ac.abort('gwak')
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.assert.strictEqual(req.signal.aborted, true)
  t.assert.strictEqual(req.signal.reason, 'gwak')
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

  t.assert.strictEqual(request.headers.get('content-type'), 'application/x-www-form-urlencoded;charset=UTF-8')
  t.assert.strictEqual(request.headers.get('authorization'), 'test')
  t.assert.strictEqual(await request.text(), 'abc=123')
})

test('post aborted signal cloned', (t) => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.assert.strictEqual(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    t.assert.strictEqual(req.signal.reason, 'gwak')
  }, { once: true })
  ac.abort('gwak')
})

test('request signal stays connected after the request is garbage collected', async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('gc is not available. Run with --expose-gc.')
    return
  }

  const ac = new AbortController()
  let signal

  {
    const request = new Request('http://asd', { signal: ac.signal })
    signal = request.signal
  }

  const aborted = waitForAbort(signal)

  await forceGarbageCollection()

  ac.abort('gwak')
  t.assert.strictEqual(await aborted, true)
  t.assert.strictEqual(signal.aborted, true)
  t.assert.strictEqual(signal.reason, 'gwak')
})

test('cloned request signal stays connected after garbage collection', async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('gc is not available. Run with --expose-gc.')
    return
  }

  const ac = new AbortController()
  let request

  {
    const originalRequest = new Request('http://asd', { signal: ac.signal })
    request = originalRequest.clone()
  }

  const aborted = waitForAbort(request.signal)

  await forceGarbageCollection()

  ac.abort('gwak')
  t.assert.strictEqual(await aborted, true)
  t.assert.strictEqual(request.signal.aborted, true)
  t.assert.strictEqual(request.signal.reason, 'gwak')
})

test('reusing a controller across transient requests does not emit a warning', async (t) => {
  if (typeof global.gc !== 'function') {
    t.skip('gc is not available. Run with --expose-gc.')
    return
  }

  let emittedWarning = ''
  function onWarning (warning) {
    emittedWarning = warning
  }

  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
  })

  const controller = new AbortController()
  setMaxListeners(20, controller.signal)

  for (let i = 0; i < 200; ++i) {
    const request = new Request('http://asd', { signal: controller.signal })
    request.signal.addEventListener('abort', () => {}, { once: true })
    await forceGarbageCollection(1)
  }

  t.assert.strictEqual(emittedWarning, '')
})

test('Passing headers in init', async (t) => {
  // https://github.com/nodejs/undici/issues/1400
  await t.test('Headers instance', (t) => {
    const req = new Request('http://localhost', {
      headers: new Headers({ key: 'value' })
    })

    t.assert.strictEqual(req.headers.get('key'), 'value')
  })

  await t.test('key:value object', (t) => {
    const req = new Request('http://localhost', {
      headers: { key: 'value' }
    })

    t.assert.strictEqual(req.headers.get('key'), 'value')
  })

  await t.test('[key, value][]', (t) => {
    const req = new Request('http://localhost', {
      headers: [['key', 'value']]
    })

    t.assert.strictEqual(req.headers.get('key'), 'value')
  })
})

test('Symbol.toStringTag', (t) => {
  const req = new Request('http://localhost')

  t.assert.strictEqual(req[Symbol.toStringTag], 'Request')
  t.assert.strictEqual(Request.prototype[Symbol.toStringTag], 'Request')
})

test('invalid RequestInit values', (t) => {
  /* eslint-disable no-new */
  t.assert.throws(() => {
    new Request('http://l', { mode: 'CoRs' })
  }, TypeError, 'not exact case = error')

  t.assert.throws(() => {
    new Request('http://l', { mode: 'random' })
  }, TypeError)

  t.assert.throws(() => {
    new Request('http://l', { credentials: 'OMIt' })
  }, TypeError, 'not exact case = error')

  t.assert.throws(() => {
    new Request('http://l', { credentials: 'random' })
  }, TypeError)

  t.assert.throws(() => {
    new Request('http://l', { cache: 'DeFaULt' })
  }, TypeError, 'not exact case = error')

  t.assert.throws(() => {
    new Request('http://l', { cache: 'random' })
  }, TypeError)

  t.assert.throws(() => {
    new Request('http://l', { redirect: 'FOllOW' })
  }, TypeError, 'not exact case = error')

  t.assert.throws(() => {
    new Request('http://l', { redirect: 'random' })
  }, TypeError)
  /* eslint-enable no-new */
})

test('RequestInit.signal option', async (t) => {
  t.assert.throws(() => {
    // eslint-disable-next-line no-new
    new Request('http://asd', {
      signal: true
    })
  }, TypeError)

  await t.assert.rejects(fetch('http://asd', {
    signal: false
  }), TypeError)
})

// https://github.com/nodejs/undici/issues/2050
test('set-cookie headers get cleared when passing a Request as first param', (t) => {
  const req1 = new Request('http://localhost', {
    headers: {
      'set-cookie': 'a=1'
    }
  })

  t.assert.deepStrictEqual([...req1.headers], [['set-cookie', 'a=1']])
  const req2 = new Request(req1, { headers: {} })
  t.assert.deepStrictEqual([...req1.headers], [['set-cookie', 'a=1']])
  t.assert.deepStrictEqual([...req2.headers], [])
  t.assert.deepStrictEqual(req2.headers.getSetCookie(), [])
})

// https://github.com/nodejs/undici/issues/2124
test('request.referrer', (t) => {
  for (const referrer of ['about://client', 'about://client:1234']) {
    const request = new Request('http://a', { referrer })

    t.assert.strictEqual(request.referrer, 'about:client')
  }
})

// https://github.com/nodejs/undici/issues/2445
test('Clone the set-cookie header when Request is passed as the first parameter and no header is passed.', (t) => {
  const request = new Request('http://localhost', { headers: { 'set-cookie': 'A' } })
  const request2 = new Request(request)
  t.assert.deepStrictEqual([...request.headers], [['set-cookie', 'A']])
  request2.headers.append('set-cookie', 'B')
  t.assert.deepStrictEqual([...request.headers], [['set-cookie', 'A']])
  t.assert.strictEqual(request.headers.getSetCookie().join(', '), request.headers.get('set-cookie'))
  t.assert.strictEqual(request2.headers.getSetCookie().join(', '), request2.headers.get('set-cookie'))
})

// Tests for optimization introduced in https://github.com/nodejs/undici/pull/2456
test('keys to object prototypes method', (t) => {
  const request = new Request('http://localhost', { method: 'hasOwnProperty' })
  t.assert.ok(typeof request.method === 'string')
})

// https://github.com/nodejs/undici/issues/2465
test('Issue#2465', async (t) => {
  t.plan(1)
  const request = new Request('http://localhost', { body: new SharedArrayBuffer(0), method: 'POST' })
  t.assert.strictEqual(await request.text(), '[object SharedArrayBuffer]')
})
