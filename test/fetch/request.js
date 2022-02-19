/* globals AbortController */

'use strict'

const { test } = require('tap')
const {
  Request
} = require('../../')
const { kState } = require('../../lib/fetch/symbols.js')

test('arg validation', (t) => {
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
    Request.prototype.destination.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.referrer.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.referrerPolicy.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.mode.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.credentials.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.cache.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.redirect.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.integrity.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.keepalive.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.isReloadNavigation.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.isHistoryNavigation.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.signal.call(null)
  }, TypeError)

  t.throws(() => {
    Request.prototype.clone.call(null)
  }, TypeError)

  t.end()
})

test('undefined window', t => {
  t.doesNotThrow(() => new Request('http://asd', { window: undefined }))
  t.end()
})

test('undefined body', t => {
  const req = new Request('http://asd', { body: undefined })
  t.equal(req[kState].body, null)
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
  t.equal(req.integrity, '')
  t.end()
})

test('undefined signal', t => {
  const req = new Request('http://asd', { signal: undefined })
  t.equal(req.signal.aborted, false)
  t.end()
})

test('pre aborted signal', t => {
  const ac = new AbortController()
  ac.abort()
  const req = new Request('http://asd', { signal: ac.signal })
  t.equal(req.signal.aborted, true)
  t.end()
})

test('post aborted signal', t => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal })
  t.equal(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    t.pass()
  })
  ac.abort()
})

test('pre aborted signal cloned', t => {
  const ac = new AbortController()
  ac.abort()
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.equal(req.signal.aborted, true)
  t.end()
})

test('post aborted signal cloned', t => {
  t.plan(2)

  const ac = new AbortController()
  const req = new Request('http://asd', { signal: ac.signal }).clone()
  t.equal(req.signal.aborted, false)
  ac.signal.addEventListener('abort', () => {
    t.pass()
  })
  ac.abort()
})
