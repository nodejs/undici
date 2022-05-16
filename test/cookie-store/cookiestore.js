'use strict'

const { test } = require('tap')
const { CookieStoreFrom, CookieStore } = require('../../lib/cookie-store/cookie-store')

test('CookieStoreFrom', async (t) => {
  const setCookie = 'sessionId=e8bb43229de9; Domain=foo.example.com'

  t.doesNotThrow(() => CookieStoreFrom(setCookie))
  t.doesNotThrow(() => CookieStoreFrom([setCookie]))
  t.doesNotThrow(() => CookieStoreFrom())
  t.throws(() => CookieStoreFrom([true]))

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

    cookieStore = CookieStoreFrom()
    await cookieStore.set({ name: 'key', value: 'value' })

    t.same(
      await cookieStore.get('key'),
      {
        name: 'key',
        value: 'value',
        domain: null,
        path: '/',
        expires: null,
        secure: true,
        sameSite: 'strict'
      }
    )

    await cookieStore.set({ name: 'key', value: 'value2', path: '/longpathsosortscorrectly' }) // duplicate key

    t.same(
      (await cookieStore.get('key')).value,
      'value2'
    )

    t.end()
  })

  t.test('multiple attributes', async (t) => {
    const cookie = 'key=value; Domain=foo.com; PaTh=/account/login; Secure; sAMeSIte=LaX'
    cookieStore = CookieStoreFrom(cookie)

    t.same(
      await cookieStore.get('key'),
      {
        name: 'key',
        value: 'value',
        domain: 'foo.com',
        path: '/account/login',
        expires: null,
        secure: true,
        sameSite: 'lax'
      }
    )

    t.end()
  })

  t.test('CookieStore.set options', async (t) => {
    cookieStore = CookieStoreFrom()

    await t.resolves(cookieStore.set({ name: 'a', value: 'b', domain: 'foo.com' }))

    await t.resolves(cookieStore.set({ name: 'a', value: 'b', expires: (Date.now() / 1000) + 86_400 }))

    await t.resolves(cookieStore.set({ name: 'a', value: 'b', path: '/hi' }))

    await cookieStore.set({ name: 'a', value: 'b', sameSite: 'lax', path: '/longer' })
    t.equal((await cookieStore.get('a')).sameSite, 'lax')

    await cookieStore.set({ name: 'a', value: 'b', sameSite: 'none', path: '/longest' })
    t.equal((await cookieStore.get('a')).sameSite, 'none')

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

    const expected = [
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
    cookieStore = CookieStoreFrom()

    await cookieStore.set('a', 'b')
    await cookieStore.set('c', 'd')

    await cookieStore.delete('a')
    t.equal(await cookieStore.get('a'), undefined)

    await cookieStore.delete('c')
    t.equal(await cookieStore.get('c'), undefined)

    t.end()
  })

  t.end()
})

test('Missing and invalid arguments', async (t) => {
  const cookieStore = CookieStoreFrom('a=b')

  await t.rejects(cookieStore.get(null))
  await t.rejects(cookieStore.get({}))

  try {
    await cookieStore.set()
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.delete()
    t.fail()
  } catch {
    t.pass()
  }

  for (const [key, value] of [
    ['\u0000Key', 'value'],
    ['Key', '\u0000Value'],
    [{ name: '\u0000Key', value: 'Value' }],
    [{ name: 'Key', value: '\u0000Value' }]
  ]) {
    try {
      await cookieStore.set(key, value)
      t.fail()
    } catch {
      t.pass()
    }
  }

  try {
    await cookieStore.set('', 'a=b')
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.set('', '')
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.set(''.padEnd(2048, 'k'), ''.padEnd(2049, 'v'))
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.set({ name: 'a', value: 'b', domain: '.foo.com' })
    t.fail()
  } catch {
    t.pass()
  }

  try {
    const domain = ''.padEnd(1025, 'f') + '.com'
    await cookieStore.set({ name: 'a', value: 'b', domain })
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.set({ name: 'a', value: 'b', path: 'hi' })
    t.fail()
  } catch {
    t.pass()
  }

  try {
    await cookieStore.set({ name: 'a', value: 'b', path: 'p'.repeat(1025) })
    t.fail()
  } catch {
    t.pass()
  }

  t.end()
})

test('Invalid domain', async (t) => {
  const cookieStore = CookieStoreFrom(undefined, 'https://example.com')
  const options = { name: 'name', value: 'value', domain: 'example.org' }

  try {
    await cookieStore.set(options)
    t.fail()
  } catch {
    t.pass()
  }

  await t.resolves(cookieStore.set({ ...options, domain: 'example.com' }))

  t.end()
})
