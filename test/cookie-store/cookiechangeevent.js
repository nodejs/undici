'use strict'

const { test } = require('tap')
const { CookieChangeEvent } = require('../../lib/cookie-store/cookie-change-event')
const { CookieStoreFrom } = require('../../lib/cookie-store/cookie-store')

test('CookieChangeEvent', (t) => {
  const event = new CookieChangeEvent('change')

  t.ok(event instanceof Event)
  t.ok(Array.isArray(event.changed) && event.changed.length === 0)
  t.ok(Array.isArray(event.deleted) && event.deleted.length === 0)
  t.ok(Object.isFrozen(event.changed))
  t.ok(Object.isFrozen(event.deleted))

  t.end()
})

test('set cookie listener', async (t) => {
  const cookieStore = CookieStoreFrom()

  const cookie = [
    {
      name: 'a',
      value: 'b',
      domain: null,
      path: '/',
      expires: null,
      secure: true,
      sameSite: 'strict'
    }
  ]

  function changeEventHandler (event) {
    t.equal(this, cookieStore)
    t.ok(event instanceof CookieChangeEvent)
    t.same(event.changed, cookie)
  }

  cookieStore.addEventListener('change', changeEventHandler)
  cookieStore.onchange = changeEventHandler

  await cookieStore.set('a', 'b')

  cookieStore.removeEventListener('change', changeEventHandler)
  cookieStore.onchange = null

  t.end()
})

test('delete cookie listener', async (t) => {
  const cookieStore = CookieStoreFrom('a=b; Domain=example.com; Path=/test/; Max-Age=20000')

  const cookie = [
    {
      name: 'a',
      value: 'b',
      domain: 'example.com',
      path: '/test/',
      expires: null,
      secure: false,
      sameSite: 'strict'
    }
  ]

  function changeEventHandler (event) {
    t.equal(this, cookieStore)
    t.ok(event instanceof CookieChangeEvent)
    t.same(event.deleted, cookie)
  }

  cookieStore.addEventListener('change', changeEventHandler)
  cookieStore.onchange = changeEventHandler

  await cookieStore.delete('a')

  cookieStore.removeEventListener('change', changeEventHandler)
  cookieStore.onchange = null

  t.end()
})
