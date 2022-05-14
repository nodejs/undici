'use strict'

const { test } = require('tap')
const { CookieStoreFrom, CookieStore } = require('../../lib/cookie-store/cookie-store')

test('CookieStoreFrom', async (t) => {
  const setCookie = 'sessionId=e8bb43229de9; Domain=foo.example.com'

  t.doesNotThrow(() => CookieStoreFrom(setCookie))
  t.doesNotThrow(() => CookieStoreFrom([setCookie]))
  t.doesNotThrow(() => CookieStoreFrom())

  const cookieStore = CookieStoreFrom(setCookie)

  t.ok(cookieStore instanceof CookieStore)
  t.end()
})

test('CookieStore.prototype methods', async (t) => {
  let cookieStore = CookieStoreFrom('id=a3fWa; Max-Age=2592000')

  t.test('CookieStore.get', async (t) => {
    const cookie = await cookieStore.get({ name: 'id' })
    const cookie2 = await cookieStore.get('id')

    t.equal(cookie.name, 'id')
    t.equal(cookie.value, 'a3fWa')
    t.equal(cookie2.name, 'id')
    t.equal(cookie2.value, 'a3fWa')

    t.end()
  })

  t.test('CookieStore.set', async (t) => {
    // unicode chars
    await cookieStore.set('ï', 'undici CookieStore')
    // bom
    await cookieStore.set('BOM\uFEFFMOB', 'Woah')

    t.same(await cookieStore.get('ï'), {
      name: 'ï',
      value: 'undici CookieStore',
      domain: null,
      path: '/',
      expires: null,
      secure: true,
      sameSite: 'strict'
    })

    // doesn't remove BOM
    t.same(await cookieStore.get('BOMMOB'), undefined)

    // removes BOM in the name
    t.same(await cookieStore.get('BOM\uFEFFMOB'), {
      name: 'BOM\uFEFFMOB',
      value: 'Woah',
      domain: null,
      path: '/',
      expires: null,
      secure: true,
      sameSite: 'strict'
    })

    t.end()
  })

  t.test('CookieStore.getAll', async (t) => {
    cookieStore = CookieStoreFrom()
    await cookieStore.set('a', 'b')
    await cookieStore.set('c', 'd')
    await cookieStore.set('e', 'f')

    // no options
    t.same(await cookieStore.getAll(), [
      {
        name: 'a',
        value: 'b',
        domain: null,
        path: '/',
        expires: null,
        secure: true,
        sameSite: 'strict'
      },
      {
        name: 'c',
        value: 'd',
        domain: null,
        path: '/',
        expires: null,
        secure: true,
        sameSite: 'strict'
      },
      {
        name: 'e',
        value: 'f',
        domain: null,
        path: '/',
        expires: null,
        secure: true,
        sameSite: 'strict'
      }
    ])

    cookieStore = CookieStoreFrom()
    await cookieStore.set('a', 'b')
    await cookieStore.set('a', 'c')
    await cookieStore.set('d', 'e')

    // duplicated names are replaced
    const expected = [
      {
        name: 'a',
        value: 'c',
        domain: null,
        path: '/',
        expires: null,
        secure: true,
        sameSite: 'strict'
      }
    ]

    t.same(await cookieStore.getAll('a'), expected)
    t.same(await cookieStore.getAll({ name: 'a' }), expected)

    cookieStore = CookieStoreFrom()

    t.same(await cookieStore.getAll('non-existent'), [])
    t.same(await cookieStore.getAll({ name: 'non-existent' }), [])

    t.end()
  })

  t.test('CookieStore.delete', async (t) => {

  })

  t.end()
})
