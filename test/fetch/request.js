/* globals AbortController */

'use strict'

const { test } = require('tap')
const {
  Request
} = require('../../')

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
      window: null
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
