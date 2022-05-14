'use strict'

const { test } = require('tap')
const { CookieStore } = require('../../lib/cookie-store/cookie-store')

test('CookieStore signatures are correct', (t) => {
  t.equal(CookieStore.prototype.get.length, 0)
  t.equal(CookieStore.prototype.getAll.length, 0)
  t.equal(CookieStore.prototype.set.length, 1)
  t.equal(CookieStore.prototype.delete.length, 1)
  t.equal(CookieStore.length, 0)
  t.equal(CookieStore.__proto__, EventTarget) // eslint-disable-line no-proto

  t.equal(CookieStore.prototype[Symbol.toStringTag], 'CookieStore')
  t.equal(Object.prototype.toString.call(CookieStore.prototype), '[object CookieStore]')

  t.end()
})

test('Not constructable', (t) => {
  t.throws(() => {
    new CookieStore() // eslint-disable-line no-new
  })

  t.end()
})

test('brand checks', (t) => {
  const p = CookieStore.prototype

  t.throws(() => p.get.call(null), TypeError)
  t.throws(() => p.getAll.call(null), TypeError)
  t.throws(() => p.set.call(null), TypeError)
  t.throws(() => p.delete.call(null), TypeError)
  t.doesNotThrow(() => p[Symbol.toStringTag])

  t.end()
})
