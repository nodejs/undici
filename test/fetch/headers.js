'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { Headers, fill, setHeadersGuard } = require('../../lib/web/fetch/headers')
const { once } = require('node:events')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')

test('Headers initialization', async (t) => {
  await t.test('allows undefined', () => {
    const { doesNotThrow } = tspl(t, { plan: 1 })

    doesNotThrow(() => new Headers())
  })

  await t.test('with array of header entries', async (t) => {
    await t.test('fails on invalid array-based init', (t) => {
      const { throws } = tspl(t, { plan: 3 })
      throws(
        () => new Headers([['undici', 'fetch'], ['fetch']]),
        TypeError('Headers constructor: expected name/value pair to be length 2, found 1.')
      )
      throws(() => new Headers(['undici', 'fetch', 'fetch']), TypeError)
      throws(
        () => new Headers([0, 1, 2]),
        TypeError('Headers contructor: init[0] (0) is not iterable.')
      )
    })

    await t.test('allows even length init', (t) => {
      const { doesNotThrow } = tspl(t, { plan: 1 })
      const init = [['undici', 'fetch'], ['fetch', 'undici']]
      doesNotThrow(() => new Headers(init))
    })

    await t.test('fails for event flattened init', (t) => {
      const { throws } = tspl(t, { plan: 1 })
      const init = ['undici', 'fetch', 'fetch', 'undici']
      throws(
        () => new Headers(init),
        TypeError('Headers contructor: init[0] ("undici") is not iterable.')
      )
    })
  })

  await t.test('with object of header entries', (t) => {
    const { doesNotThrow } = tspl(t, { plan: 1 })
    const init = {
      undici: 'fetch',
      fetch: 'undici'
    }
    doesNotThrow(() => new Headers(init))
  })

  await t.test('fails silently if a boxed primitive object is passed', (t) => {
    const { doesNotThrow } = tspl(t, { plan: 3 })
    /* eslint-disable no-new-wrappers */
    doesNotThrow(() => new Headers(new Number()))
    doesNotThrow(() => new Headers(new Boolean()))
    doesNotThrow(() => new Headers(new String()))
    /* eslint-enable no-new-wrappers */
  })

  await t.test('fails if primitive is passed', (t) => {
    const { throws } = tspl(t, { plan: 2 })
    const expectedTypeError = TypeError
    throws(() => new Headers(1), expectedTypeError)
    throws(() => new Headers('1'), expectedTypeError)
  })

  await t.test('allows some weird stuff (because of webidl)', () => {
    assert.doesNotThrow(() => {
      new Headers(function () {}) // eslint-disable-line no-new
    })

    assert.doesNotThrow(() => {
      new Headers(Function) // eslint-disable-line no-new
    })
  })

  await t.test('allows a myriad of header values to be passed', (t) => {
    const { doesNotThrow, throws } = tspl(t, { plan: 4 })

    // Headers constructor uses Headers.append

    doesNotThrow(() => new Headers([
      ['a', ['b', 'c']],
      ['d', ['e', 'f']]
    ]), 'allows any array values')
    doesNotThrow(() => new Headers([
      ['key', null]
    ]), 'allows null values')
    throws(() => new Headers([
      ['key']
    ]), 'throws when 2 arguments are not passed')
    throws(() => new Headers([
      ['key', 'value', 'value2']
    ]), 'throws when too many arguments are passed')
  })

  await t.test('accepts headers as objects with array values', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })
    const headers = new Headers({
      c: '5',
      b: ['3', '4'],
      a: ['1', '2']
    })

    deepStrictEqual([...headers.entries()], [
      ['a', '1,2'],
      ['b', '3,4'],
      ['c', '5']
    ])
  })
})

test('Headers append', async (t) => {
  await t.test('adds valid header entry to instance', (t) => {
    const { doesNotThrow, strictEqual } = tspl(t, { plan: 2 })
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    doesNotThrow(() => headers.append(name, value))
    strictEqual(headers.get(name), value)
  })

  await t.test('adds valid header to existing entry', (t) => {
    const { strictEqual, doesNotThrow } = tspl(t, { plan: 4 })
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    const value3 = 'fetch3'
    headers.append(name, value1)
    strictEqual(headers.get(name), value1)
    doesNotThrow(() => headers.append(name, value2))
    doesNotThrow(() => headers.append(name, value3))
    strictEqual(headers.get(name), [value1, value2, value3].join(', '))
  })

  await t.test('throws on invalid entry', (t) => {
    const { throws } = tspl(t, { plan: 3 })
    const headers = new Headers()

    throws(() => headers.append(), 'throws on missing name and value')
    throws(() => headers.append('undici'), 'throws on missing value')
    throws(() => headers.append('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })
})

test('Headers delete', async (t) => {
  await t.test('deletes valid header entry from instance', (t) => {
    const { strictEqual, doesNotThrow } = tspl(t, { plan: 3 })
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    strictEqual(headers.get(name), value)
    doesNotThrow(() => headers.delete(name))
    strictEqual(headers.get(name), null)
  })

  await t.test('does not mutate internal list when no match is found', (t) => {
    const { strictEqual, doesNotThrow } = tspl(t, { plan: 3 })

    const headers = new Headers()
    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    strictEqual(headers.get(name), value)
    doesNotThrow(() => headers.delete('not-undici'))
    strictEqual(headers.get(name), value)
  })

  await t.test('throws on invalid entry', (t) => {
    const { throws } = tspl(t, { plan: 2 })
    const headers = new Headers()

    throws(() => headers.delete(), 'throws on missing namee')
    throws(() => headers.delete('invalid @ header ? name'), 'throws on invalid name')
  })

  // https://github.com/nodejs/undici/issues/2429
  await t.test('`Headers#delete` returns undefined', (t) => {
    const { strictEqual } = tspl(t, { plan: 2 })
    const headers = new Headers({ test: 'test' })

    strictEqual(headers.delete('test'), undefined)
    strictEqual(headers.delete('test2'), undefined)
  })
})

test('Headers get', async (t) => {
  await t.test('returns null if not found in instance', (t) => {
    const { strictEqual } = tspl(t, { plan: 1 })
    const headers = new Headers()
    headers.append('undici', 'fetch')

    strictEqual(headers.get('not-undici'), null)
  })

  await t.test('returns header values from valid header name', (t) => {
    const { strictEqual } = tspl(t, { plan: 2 })
    const headers = new Headers()

    const name = 'undici'; const value1 = 'fetch1'; const value2 = 'fetch2'
    headers.append(name, value1)
    strictEqual(headers.get(name), value1)
    headers.append(name, value2)
    strictEqual(headers.get(name), [value1, value2].join(', '))
  })

  await t.test('throws on invalid entry', (t) => {
    const { throws } = tspl(t, { plan: 2 })
    const headers = new Headers()

    throws(() => headers.get(), 'throws on missing name')
    throws(() => headers.get('invalid @ header ? name'), 'throws on invalid name')
  })
})

test('Headers has', async (t) => {
  await t.test('returns boolean existence for a header name', (t) => {
    const { strictEqual } = tspl(t, { plan: 2 })
    const headers = new Headers()

    const name = 'undici'
    headers.append('not-undici', 'fetch')
    strictEqual(headers.has(name), false)
    headers.append(name, 'fetch')
    strictEqual(headers.has(name), true)
  })

  await t.test('throws on invalid entry', (t) => {
    const { throws } = tspl(t, { plan: 2 })
    const headers = new Headers()

    throws(() => headers.has(), 'throws on missing name')
    throws(() => headers.has('invalid @ header ? name'), 'throws on invalid name')
  })
})

test('Headers set', async (t) => {
  await t.test('sets valid header entry to instance', (t) => {
    const { doesNotThrow, strictEqual } = tspl(t, { plan: 2 })
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append('not-undici', 'fetch')
    doesNotThrow(() => headers.set(name, value))
    strictEqual(headers.get(name), value)
  })

  await t.test('overwrites existing entry', (t) => {
    const { doesNotThrow, strictEqual } = tspl(t, { plan: 4 })
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    doesNotThrow(() => headers.set(name, value1))
    strictEqual(headers.get(name), value1)
    doesNotThrow(() => headers.set(name, value2))
    strictEqual(headers.get(name), value2)
  })

  await t.test('allows setting a myriad of values', (t) => {
    const { doesNotThrow, throws } = tspl(t, { plan: 4 })
    const headers = new Headers()

    doesNotThrow(() => headers.set('a', ['b', 'c']), 'sets array values properly')
    doesNotThrow(() => headers.set('b', null), 'allows setting null values')
    throws(() => headers.set('c'), 'throws when 2 arguments are not passed')
    doesNotThrow(() => headers.set('c', 'd', 'e'), 'ignores extra arguments')
  })

  await t.test('throws on invalid entry', (t) => {
    const { throws } = tspl(t, { plan: 3 })
    const headers = new Headers()

    throws(() => headers.set(), 'throws on missing name and value')
    throws(() => headers.set('undici'), 'throws on missing value')
    throws(() => headers.set('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })

  // https://github.com/nodejs/undici/issues/2431
  await t.test('`Headers#set` returns undefined', (t) => {
    const { strictEqual, ok } = tspl(t, { plan: 2 })
    const headers = new Headers()

    strictEqual(headers.set('a', 'b'), undefined)

    ok(!(headers.set('c', 'd') instanceof Map))
  })
})

test('Headers forEach', async (t) => {
  const headers = new Headers([['a', 'b'], ['c', 'd']])

  await t.test('standard', () => {
    assert.strictEqual(typeof headers.forEach, 'function')

    headers.forEach((value, key, headerInstance) => {
      assert.ok(value === 'b' || value === 'd')
      assert.ok(key === 'a' || key === 'c')
      assert.strictEqual(headers, headerInstance)
    })
  })

  await t.test('when no thisArg is set, it is globalThis', () => {
    headers.forEach(function () {
      assert.strictEqual(this, globalThis)
    })
  })

  await t.test('with thisArg', () => {
    const thisArg = { a: Math.random() }
    headers.forEach(function () {
      assert.strictEqual(this, thisArg)
    }, thisArg)
  })
})

test('Headers as Iterable', async (t) => {
  await t.test('should freeze values while iterating', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })
    const init = [
      ['foo', '123'],
      ['bar', '456']
    ]
    const expected = [
      ['foo', '123'],
      ['x-x-bar', '456']
    ]
    const headers = new Headers(init)
    for (const [key, val] of headers) {
      headers.delete(key)
      headers.set(`x-${key}`, val)
    }
    deepStrictEqual([...headers], expected)
  })

  await t.test('returns combined and sorted entries using .forEach()', (t) => {
    const { deepStrictEqual, strictEqual } = tspl(t, { plan: 8 })
    const init = [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['abc', '4'],
      ['b', '5']
    ]
    const expected = [
      ['a', '1'],
      ['abc', '4'],
      ['b', '2, 5'],
      ['c', '3']
    ]
    const headers = new Headers(init)
    const that = {}
    let i = 0
    headers.forEach(function (value, key, _headers) {
      deepStrictEqual(expected[i++], [key, value])
      strictEqual(this, that)
    }, that)
  })

  await t.test('returns combined and sorted entries using .entries()', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 4 })
    const init = [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['abc', '4'],
      ['b', '5']
    ]
    const expected = [
      ['a', '1'],
      ['abc', '4'],
      ['b', '2, 5'],
      ['c', '3']
    ]
    const headers = new Headers(init)
    let i = 0
    for (const header of headers.entries()) {
      deepStrictEqual(header, expected[i++])
    }
  })

  await t.test('returns combined and sorted keys using .keys()', (t) => {
    const { strictEqual } = tspl(t, { plan: 4 })
    const init = [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['abc', '4'],
      ['b', '5']
    ]
    const expected = ['a', 'abc', 'b', 'c']
    const headers = new Headers(init)
    let i = 0
    for (const key of headers.keys()) {
      strictEqual(key, expected[i++])
    }
  })

  await t.test('returns combined and sorted values using .values()', (t) => {
    const { strictEqual } = tspl(t, { plan: 4 })
    const init = [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['abc', '4'],
      ['b', '5']
    ]
    const expected = ['1', '4', '2, 5', '3']
    const headers = new Headers(init)
    let i = 0
    for (const value of headers.values()) {
      strictEqual(value, expected[i++])
    }
  })

  await t.test('returns combined and sorted entries using for...of loop', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 5 })
    const init = [
      ['a', '1'],
      ['b', '2'],
      ['c', '3'],
      ['abc', '4'],
      ['b', '5'],
      ['d', ['6', '7']]
    ]
    const expected = [
      ['a', '1'],
      ['abc', '4'],
      ['b', '2, 5'],
      ['c', '3'],
      ['d', '6,7']
    ]
    let i = 0
    for (const header of new Headers(init)) {
      deepStrictEqual(header, expected[i++])
    }
  })

  await t.test('validate append ordering', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })
    const headers = new Headers([['b', '2'], ['c', '3'], ['e', '5']])
    headers.append('d', '4')
    headers.append('a', '1')
    headers.append('f', '6')
    headers.append('c', '7')
    headers.append('abc', '8')

    const expected = [...new Map([
      ['a', '1'],
      ['abc', '8'],
      ['b', '2'],
      ['c', '3, 7'],
      ['d', '4'],
      ['e', '5'],
      ['f', '6']
    ])]

    deepStrictEqual([...headers], expected)
  })

  await t.test('always use the same prototype Iterator', (t) => {
    const HeadersIteratorNext = Function.call.bind(new Headers()[Symbol.iterator]().next)

    const init = [
      ['a', '1'],
      ['b', '2']
    ]

    const headers = new Headers(init)
    const iterator = headers[Symbol.iterator]()
    assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: init[0], done: false })
    assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: init[1], done: false })
    assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: undefined, done: true })
  })
})

test('arg validation', () => {
  // fill
  assert.throws(() => {
    fill({}, 0)
  }, TypeError)

  const headers = new Headers()

  // constructor
  assert.throws(() => {
    // eslint-disable-next-line
    new Headers(0)
  }, TypeError)

  // get [Symbol.toStringTag]
  assert.doesNotThrow(() => {
    Object.prototype.toString.call(Headers.prototype)
  })

  // toString
  assert.doesNotThrow(() => {
    Headers.prototype.toString.call(null)
  })

  // append
  assert.throws(() => {
    Headers.prototype.append.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.append()
  }, TypeError)

  // delete
  assert.throws(() => {
    Headers.prototype.delete.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.delete()
  }, TypeError)

  // get
  assert.throws(() => {
    Headers.prototype.get.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.get()
  }, TypeError)

  // has
  assert.throws(() => {
    Headers.prototype.has.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.has()
  }, TypeError)

  // set
  assert.throws(() => {
    Headers.prototype.set.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.set()
  }, TypeError)

  // forEach
  assert.throws(() => {
    Headers.prototype.forEach.call(null)
  }, TypeError)
  assert.throws(() => {
    headers.forEach()
  }, TypeError)
  assert.throws(() => {
    headers.forEach(1)
  }, TypeError)

  // inspect
  assert.throws(() => {
    Headers.prototype[Symbol.for('nodejs.util.inspect.custom')].call(null)
  }, TypeError)
})

test('function signature verification', async (t) => {
  await t.test('function length', () => {
    assert.strictEqual(Headers.prototype.append.length, 2)
    assert.strictEqual(Headers.prototype.constructor.length, 0)
    assert.strictEqual(Headers.prototype.delete.length, 1)
    assert.strictEqual(Headers.prototype.entries.length, 0)
    assert.strictEqual(Headers.prototype.forEach.length, 1)
    assert.strictEqual(Headers.prototype.get.length, 1)
    assert.strictEqual(Headers.prototype.has.length, 1)
    assert.strictEqual(Headers.prototype.keys.length, 0)
    assert.strictEqual(Headers.prototype.set.length, 2)
    assert.strictEqual(Headers.prototype.values.length, 0)
    assert.strictEqual(Headers.prototype[Symbol.iterator].length, 0)
    assert.strictEqual(Headers.prototype.toString.length, 0)
  })

  await t.test('function equality', () => {
    assert.strictEqual(Headers.prototype.entries, Headers.prototype[Symbol.iterator])
    assert.strictEqual(Headers.prototype.toString, Object.prototype.toString)
  })

  await t.test('toString and Symbol.toStringTag', () => {
    assert.strictEqual(Object.prototype.toString.call(Headers.prototype), '[object Headers]')
    assert.strictEqual(Headers.prototype[Symbol.toStringTag], 'Headers')
    assert.strictEqual(Headers.prototype.toString.call(null), '[object Null]')
  })
})

test('various init paths of Headers', () => {
  const h1 = new Headers()
  const h2 = new Headers({})
  const h3 = new Headers(undefined)
  assert.strictEqual([...h1.entries()].length, 0)
  assert.strictEqual([...h2.entries()].length, 0)
  assert.strictEqual([...h3.entries()].length, 0)
})

test('immutable guard', () => {
  const headers = new Headers()
  headers.set('key', 'val')
  setHeadersGuard(headers, 'immutable')

  assert.throws(() => {
    headers.set('asd', 'asd')
  })
  assert.throws(() => {
    headers.append('asd', 'asd')
  })
  assert.throws(() => {
    headers.delete('asd')
  })
  assert.strictEqual(headers.get('key'), 'val')
  assert.strictEqual(headers.has('key'), true)
})

test('request-no-cors guard', () => {
  const headers = new Headers()
  setHeadersGuard(headers, 'request-no-cors')
  assert.doesNotThrow(() => { headers.set('key', 'val') })
  assert.doesNotThrow(() => { headers.append('key', 'val') })
})

test('invalid headers', () => {
  assert.doesNotThrow(() => new Headers({ "abcdefghijklmnopqrstuvwxyz0123456789!#$%&'*+-.^_`|~": 'test' }))

  const chars = '"(),/:;<=>?@[\\]{}'.split('')

  for (const char of chars) {
    assert.throws(() => new Headers({ [char]: 'test' }), TypeError, `The string "${char}" should throw an error.`)
  }

  for (const byte of ['\r', '\n', '\t', ' ', String.fromCharCode(128), '']) {
    assert.throws(() => {
      new Headers().set(byte, 'test')
    }, TypeError, 'invalid header name')
  }

  for (const byte of [
    '\0',
    '\r',
    '\n'
  ]) {
    assert.throws(() => {
      new Headers().set('a', `a${byte}b`)
    }, TypeError, 'not allowed at all in header value')
  }

  assert.doesNotThrow(() => {
    new Headers().set('a', '\r')
  })

  assert.doesNotThrow(() => {
    new Headers().set('a', '\n')
  })

  assert.throws(() => {
    new Headers().set('a', Symbol('symbol'))
  }, TypeError, 'symbols should throw')
})

test('headers that might cause a ReDoS', () => {
  assert.doesNotThrow(() => {
    // This test will time out if the ReDoS attack is successful.
    const headers = new Headers()
    const attack = 'a' + '\t'.repeat(500_000) + '\ta'
    headers.append('fhqwhgads', attack)
  })
})

test('Headers.prototype.getSetCookie', async (t) => {
  await t.test('Mutating the returned list does not affect the set-cookie list', () => {
    const h = new Headers([
      ['set-cookie', 'a=b'],
      ['set-cookie', 'c=d']
    ])

    const old = h.getSetCookie()
    h.getSetCookie().push('oh=no')
    const now = h.getSetCookie()

    assert.deepStrictEqual(old, now)
  })

  // https://github.com/nodejs/undici/issues/1935
  await t.test('When Headers are cloned, so are the cookies (single entry)', async (t) => {
    const server = createServer((req, res) => {
      res.setHeader('Set-Cookie', 'test=onetwo')
      res.end('Hello World!')
    }).listen(0)

    await once(server, 'listening')
    t.after(closeServerAsPromise(server))

    const res = await fetch(`http://localhost:${server.address().port}`)
    const entries = Object.fromEntries(res.headers.entries())

    assert.deepStrictEqual(res.headers.getSetCookie(), ['test=onetwo'])
    assert.ok('set-cookie' in entries)
  })

  await t.test('When Headers are cloned, so are the cookies (multiple entries)', async (t) => {
    const server = createServer((req, res) => {
      res.setHeader('Set-Cookie', ['test=onetwo', 'test=onetwothree'])
      res.end('Hello World!')
    }).listen(0)

    await once(server, 'listening')
    t.after(closeServerAsPromise(server))

    const res = await fetch(`http://localhost:${server.address().port}`)
    const entries = Object.fromEntries(res.headers.entries())

    assert.deepStrictEqual(res.headers.getSetCookie(), ['test=onetwo', 'test=onetwothree'])
    assert.ok('set-cookie' in entries)
  })

  await t.test('When Headers are cloned, so are the cookies (Headers constructor)', () => {
    const headers = new Headers([['set-cookie', 'a'], ['set-cookie', 'b']])

    assert.deepStrictEqual([...headers], [...new Headers(headers)])
  })
})

test('When the value is updated, update the cache', (t) => {
  const { deepStrictEqual } = tspl(t, { plan: 2 })
  const expected = [['a', 'a'], ['b', 'b'], ['c', 'c']]
  const headers = new Headers(expected)
  deepStrictEqual([...headers], expected)
  headers.append('d', 'd')
  deepStrictEqual([...headers], [...expected, ['d', 'd']])
})

test('Symbol.iterator is only accessed once', (t) => {
  const { ok } = tspl(t, { plan: 1 })

  const dict = new Proxy({}, {
    get () {
      ok(true)

      return function * () {}
    }
  })

  new Headers(dict) // eslint-disable-line no-new
})

test('Invalid Symbol.iterators', (t) => {
  const { throws } = tspl(t, { plan: 3 })

  throws(() => new Headers({ [Symbol.iterator]: null }), TypeError)
  throws(() => new Headers({ [Symbol.iterator]: undefined }), TypeError)
  throws(() => {
    const obj = { [Symbol.iterator]: null }
    Object.defineProperty(obj, Symbol.iterator, { enumerable: false })

    new Headers(obj) // eslint-disable-line no-new
  }, TypeError)
})
