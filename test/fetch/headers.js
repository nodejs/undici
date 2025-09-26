'use strict'

const { test } = require('node:test')
const { Headers, fill, setHeadersGuard } = require('../../lib/web/fetch/headers')
const { once } = require('node:events')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { closeServerAsPromise } = require('../utils/node-http')

test('Headers initialization', async (t) => {
  await t.test('allows undefined', (t) => {
    t.plan(1)

    t.assert.doesNotThrow(() => new Headers())
  })

  await t.test('with array of header entries', async (t) => {
    await t.test('fails on invalid array-based init', (t) => {
      t.plan(3)
      t.assert.throws(
        () => new Headers([['undici', 'fetch'], ['fetch']]),
        TypeError('Headers constructor: expected name/value pair to be length 2, found 1.')
      )
      t.assert.throws(() => new Headers(['undici', 'fetch', 'fetch']), TypeError)
      t.assert.throws(
        () => new Headers([0, 1, 2]),
        TypeError('Headers constructor: init[0] (0) is not iterable.')
      )
    })

    await t.test('allows even length init', (t) => {
      t.plan(1)
      const init = [['undici', 'fetch'], ['fetch', 'undici']]
      t.assert.doesNotThrow(() => new Headers(init))
    })

    await t.test('fails for event flattened init', (t) => {
      t.plan(1)
      const init = ['undici', 'fetch', 'fetch', 'undici']
      t.assert.throws(
        () => new Headers(init),
        TypeError('Headers constructor: init[0] ("undici") is not iterable.')
      )
    })
  })

  await t.test('with object of header entries', (t) => {
    t.plan(1)
    const init = {
      undici: 'fetch',
      fetch: 'undici'
    }
    t.assert.doesNotThrow(() => new Headers(init))
  })

  await t.test('fails silently if a boxed primitive object is passed', (t) => {
    t.plan(3)
    /* eslint-disable no-new-wrappers */
    t.assert.doesNotThrow(() => new Headers(new Number()))
    t.assert.doesNotThrow(() => new Headers(new Boolean()))
    t.assert.doesNotThrow(() => new Headers(new String()))
    /* eslint-enable no-new-wrappers */
  })

  await t.test('fails if primitive is passed', (t) => {
    t.plan(2)
    const expectedTypeError = TypeError
    t.assert.throws(() => new Headers(1), expectedTypeError)
    t.assert.throws(() => new Headers('1'), expectedTypeError)
  })

  await t.test('allows some weird stuff (because of webidl)', (t) => {
    t.assert.doesNotThrow(() => {
      new Headers(function () {}) // eslint-disable-line no-new
    })

    t.assert.doesNotThrow(() => {
      new Headers(Function) // eslint-disable-line no-new
    })
  })

  await t.test('allows a myriad of header values to be passed', (t) => {
    t.plan(4)

    // Headers constructor uses Headers.append

    t.assert.doesNotThrow(() => new Headers([
      ['a', ['b', 'c']],
      ['d', ['e', 'f']]
    ]), 'allows any array values')
    t.assert.doesNotThrow(() => new Headers([
      ['key', null]
    ]), 'allows null values')
    t.assert.throws(() => new Headers([
      ['key']
    ]), 'throws when 2 arguments are not passed')
    t.assert.throws(() => new Headers([
      ['key', 'value', 'value2']
    ]), 'throws when too many arguments are passed')
  })

  await t.test('accepts headers as objects with array values', (t) => {
    t.plan(1)
    const headers = new Headers({
      c: '5',
      b: ['3', '4'],
      a: ['1', '2']
    })

    t.assert.deepStrictEqual([...headers.entries()], [
      ['a', '1,2'],
      ['b', '3,4'],
      ['c', '5']
    ])
  })
})

test('Headers append', async (t) => {
  await t.test('adds valid header entry to instance', (t) => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    t.assert.doesNotThrow(() => headers.append(name, value))
    t.assert.strictEqual(headers.get(name), value)
  })

  await t.test('adds valid header to existing entry', (t) => {
    t.plan(4)
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    const value3 = 'fetch3'
    headers.append(name, value1)
    t.assert.strictEqual(headers.get(name), value1)
    t.assert.doesNotThrow(() => headers.append(name, value2))
    t.assert.doesNotThrow(() => headers.append(name, value3))
    t.assert.strictEqual(headers.get(name), [value1, value2, value3].join(', '))
  })

  await t.test('throws on invalid entry', (t) => {
    t.plan(3)
    const headers = new Headers()

    t.assert.throws(() => headers.append(), 'throws on missing name and value')
    t.assert.throws(() => headers.append('undici'), 'throws on missing value')
    t.assert.throws(() => headers.append('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })
})

test('Headers delete', async (t) => {
  await t.test('deletes valid header entry from instance', (t) => {
    t.plan(3)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    t.assert.strictEqual(headers.get(name), value)
    t.assert.doesNotThrow(() => headers.delete(name))
    t.assert.strictEqual(headers.get(name), null)
  })

  await t.test('does not mutate internal list when no match is found', (t) => {
    t.plan(3)

    const headers = new Headers()
    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    t.assert.strictEqual(headers.get(name), value)
    t.assert.doesNotThrow(() => headers.delete('not-undici'))
    t.assert.strictEqual(headers.get(name), value)
  })

  await t.test('throws on invalid entry', (t) => {
    t.plan(2)
    const headers = new Headers()

    t.assert.throws(() => headers.delete(), 'throws on missing namee')
    t.assert.throws(() => headers.delete('invalid @ header ? name'), 'throws on invalid name')
  })

  // https://github.com/nodejs/undici/issues/2429
  await t.test('`Headers#delete` returns undefined', (t) => {
    t.plan(2)
    const headers = new Headers({ test: 'test' })

    t.assert.strictEqual(headers.delete('test'), undefined)
    t.assert.strictEqual(headers.delete('test2'), undefined)
  })
})

test('Headers get', async (t) => {
  await t.test('returns null if not found in instance', (t) => {
    t.plan(1)
    const headers = new Headers()
    headers.append('undici', 'fetch')

    t.assert.strictEqual(headers.get('not-undici'), null)
  })

  await t.test('returns header values from valid header name', (t) => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'; const value1 = 'fetch1'; const value2 = 'fetch2'
    headers.append(name, value1)
    t.assert.strictEqual(headers.get(name), value1)
    headers.append(name, value2)
    t.assert.strictEqual(headers.get(name), [value1, value2].join(', '))
  })

  await t.test('throws on invalid entry', (t) => {
    t.plan(2)
    const headers = new Headers()

    t.assert.throws(() => headers.get(), 'throws on missing name')
    t.assert.throws(() => headers.get('invalid @ header ? name'), 'throws on invalid name')
  })
})

test('Headers has', async (t) => {
  await t.test('returns boolean existence for a header name', (t) => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    headers.append('not-undici', 'fetch')
    t.assert.strictEqual(headers.has(name), false)
    headers.append(name, 'fetch')
    t.assert.strictEqual(headers.has(name), true)
  })

  await t.test('throws on invalid entry', (t) => {
    t.plan(2)
    const headers = new Headers()

    t.assert.throws(() => headers.has(), 'throws on missing name')
    t.assert.throws(() => headers.has('invalid @ header ? name'), 'throws on invalid name')
  })
})

test('Headers set', async (t) => {
  await t.test('sets valid header entry to instance', (t) => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append('not-undici', 'fetch')
    t.assert.doesNotThrow(() => headers.set(name, value))
    t.assert.strictEqual(headers.get(name), value)
  })

  await t.test('overwrites existing entry', (t) => {
    t.plan(4)
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    t.assert.doesNotThrow(() => headers.set(name, value1))
    t.assert.strictEqual(headers.get(name), value1)
    t.assert.doesNotThrow(() => headers.set(name, value2))
    t.assert.strictEqual(headers.get(name), value2)
  })

  await t.test('allows setting a myriad of values', (t) => {
    t.plan(4)
    const headers = new Headers()

    t.assert.doesNotThrow(() => headers.set('a', ['b', 'c']), 'sets array values properly')
    t.assert.doesNotThrow(() => headers.set('b', null), 'allows setting null values')
    t.assert.throws(() => headers.set('c'), 'throws when 2 arguments are not passed')
    t.assert.doesNotThrow(() => headers.set('c', 'd', 'e'), 'ignores extra arguments')
  })

  await t.test('throws on invalid entry', (t) => {
    t.plan(3)
    const headers = new Headers()

    t.assert.throws(() => headers.set(), 'throws on missing name and value')
    t.assert.throws(() => headers.set('undici'), 'throws on missing value')
    t.assert.throws(() => headers.set('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })

  // https://github.com/nodejs/undici/issues/2431
  await t.test('`Headers#set` returns undefined', (t) => {
    t.plan(2)
    const headers = new Headers()

    t.assert.strictEqual(headers.set('a', 'b'), undefined)

    t.assert.ok(!(headers.set('c', 'd') instanceof Map))
  })
})

test('Headers forEach', async (t) => {
  const headers = new Headers([['a', 'b'], ['c', 'd']])

  await t.test('standard', (t) => {
    t.assert.strictEqual(typeof headers.forEach, 'function')

    headers.forEach((value, key, headerInstance) => {
      t.assert.ok(value === 'b' || value === 'd')
      t.assert.ok(key === 'a' || key === 'c')
      t.assert.strictEqual(headers, headerInstance)
    })
  })

  await t.test('when no thisArg is set, it is globalThis', (t) => {
    headers.forEach(function () {
      t.assert.strictEqual(this, globalThis)
    })
  })

  await t.test('with thisArg', (t) => {
    const thisArg = { a: Math.random() }
    headers.forEach(function () {
      t.assert.strictEqual(this, thisArg)
    }, thisArg)
  })
})

test('Headers as Iterable', async (t) => {
  await t.test('should freeze values while iterating', (t) => {
    t.plan(1)
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
    t.assert.deepStrictEqual([...headers], expected)
  })

  await t.test('returns combined and sorted entries using .forEach()', (t) => {
    t.plan(8)
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
      t.assert.deepStrictEqual(expected[i++], [key, value])
      t.assert.strictEqual(this, that)
    }, that)
  })

  await t.test('returns combined and sorted entries using .entries()', (t) => {
    t.plan(4)
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
      t.assert.deepStrictEqual(header, expected[i++])
    }
  })

  await t.test('returns combined and sorted keys using .keys()', (t) => {
    t.plan(4)
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
      t.assert.strictEqual(key, expected[i++])
    }
  })

  await t.test('returns combined and sorted values using .values()', (t) => {
    t.plan(4)
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
      t.assert.strictEqual(value, expected[i++])
    }
  })

  await t.test('returns combined and sorted entries using for...of loop', (t) => {
    t.plan(5)
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
      t.assert.deepStrictEqual(header, expected[i++])
    }
  })

  await t.test('validate append ordering', (t) => {
    t.plan(1)
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

    t.assert.deepStrictEqual([...headers], expected)
  })

  await t.test('always use the same prototype Iterator', (t) => {
    const HeadersIteratorNext = Function.call.bind(new Headers()[Symbol.iterator]().next)

    const init = [
      ['a', '1'],
      ['b', '2']
    ]

    const headers = new Headers(init)
    const iterator = headers[Symbol.iterator]()
    t.assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: init[0], done: false })
    t.assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: init[1], done: false })
    t.assert.deepStrictEqual(HeadersIteratorNext(iterator), { value: undefined, done: true })
  })
})

test('arg validation', (t) => {
  // fill
  t.assert.throws(() => {
    fill({}, 0)
  }, TypeError)

  const headers = new Headers()

  // constructor
  t.assert.throws(() => {
    // eslint-disable-next-line
    new Headers(0)
  }, TypeError)

  // get [Symbol.toStringTag]
  t.assert.doesNotThrow(() => {
    Object.prototype.toString.call(Headers.prototype)
  })

  // toString
  t.assert.doesNotThrow(() => {
    Headers.prototype.toString.call(null)
  })

  // append
  t.assert.throws(() => {
    Headers.prototype.append.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.append()
  }, TypeError)

  // delete
  t.assert.throws(() => {
    Headers.prototype.delete.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.delete()
  }, TypeError)

  // get
  t.assert.throws(() => {
    Headers.prototype.get.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.get()
  }, TypeError)

  // has
  t.assert.throws(() => {
    Headers.prototype.has.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.has()
  }, TypeError)

  // set
  t.assert.throws(() => {
    Headers.prototype.set.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.set()
  }, TypeError)

  // forEach
  t.assert.throws(() => {
    Headers.prototype.forEach.call(null)
  }, TypeError)
  t.assert.throws(() => {
    headers.forEach()
  }, TypeError)
  t.assert.throws(() => {
    headers.forEach(1)
  }, TypeError)

  // inspect
  t.assert.throws(() => {
    Headers.prototype[Symbol.for('nodejs.util.inspect.custom')].call(null)
  }, TypeError)
})

test('function signature verification', async (t) => {
  await t.test('function length', (t) => {
    t.assert.strictEqual(Headers.prototype.append.length, 2)
    t.assert.strictEqual(Headers.prototype.constructor.length, 0)
    t.assert.strictEqual(Headers.prototype.delete.length, 1)
    t.assert.strictEqual(Headers.prototype.entries.length, 0)
    t.assert.strictEqual(Headers.prototype.forEach.length, 1)
    t.assert.strictEqual(Headers.prototype.get.length, 1)
    t.assert.strictEqual(Headers.prototype.has.length, 1)
    t.assert.strictEqual(Headers.prototype.keys.length, 0)
    t.assert.strictEqual(Headers.prototype.set.length, 2)
    t.assert.strictEqual(Headers.prototype.values.length, 0)
    t.assert.strictEqual(Headers.prototype[Symbol.iterator].length, 0)
    t.assert.strictEqual(Headers.prototype.toString.length, 0)
  })

  await t.test('function equality', (t) => {
    t.assert.strictEqual(Headers.prototype.entries, Headers.prototype[Symbol.iterator])
    t.assert.strictEqual(Headers.prototype.toString, Object.prototype.toString)
  })

  await t.test('toString and Symbol.toStringTag', (t) => {
    t.assert.strictEqual(Object.prototype.toString.call(Headers.prototype), '[object Headers]')
    t.assert.strictEqual(Headers.prototype[Symbol.toStringTag], 'Headers')
    t.assert.strictEqual(Headers.prototype.toString.call(null), '[object Null]')
  })
})

test('various init paths of Headers', (t) => {
  const h1 = new Headers()
  const h2 = new Headers({})
  const h3 = new Headers(undefined)
  t.assert.strictEqual([...h1.entries()].length, 0)
  t.assert.strictEqual([...h2.entries()].length, 0)
  t.assert.strictEqual([...h3.entries()].length, 0)
})

test('immutable guard', (t) => {
  const headers = new Headers()
  headers.set('key', 'val')
  setHeadersGuard(headers, 'immutable')

  t.assert.throws(() => {
    headers.set('asd', 'asd')
  })
  t.assert.throws(() => {
    headers.append('asd', 'asd')
  })
  t.assert.throws(() => {
    headers.delete('asd')
  })
  t.assert.strictEqual(headers.get('key'), 'val')
  t.assert.strictEqual(headers.has('key'), true)
})

test('request-no-cors guard', (t) => {
  const headers = new Headers()
  setHeadersGuard(headers, 'request-no-cors')
  t.assert.doesNotThrow(() => { headers.set('key', 'val') })
  t.assert.doesNotThrow(() => { headers.append('key', 'val') })
})

test('invalid headers', (t) => {
  t.assert.doesNotThrow(() => new Headers({ "abcdefghijklmnopqrstuvwxyz0123456789!#$%&'*+-.^_`|~": 'test' }))

  const chars = '"(),/:;<=>?@[\\]{}'.split('')

  for (const char of chars) {
    t.assert.throws(() => new Headers({ [char]: 'test' }), TypeError, `The string "${char}" should throw an error.`)
  }

  for (const byte of ['\r', '\n', '\t', ' ', String.fromCharCode(128), '']) {
    t.assert.throws(() => {
      new Headers().set(byte, 'test')
    }, TypeError, 'invalid header name')
  }

  for (const byte of [
    '\0',
    '\r',
    '\n'
  ]) {
    t.assert.throws(() => {
      new Headers().set('a', `a${byte}b`)
    }, TypeError, 'not allowed at all in header value')
  }

  t.assert.doesNotThrow(() => {
    new Headers().set('a', '\r')
  })

  t.assert.doesNotThrow(() => {
    new Headers().set('a', '\n')
  })

  t.assert.throws(() => {
    new Headers().set('a', Symbol('symbol'))
  }, TypeError, 'symbols should throw')
})

test('headers that might cause a ReDoS', (t) => {
  t.assert.doesNotThrow(() => {
    // This test will time out if the ReDoS attack is successful.
    const headers = new Headers()
    const attack = 'a' + '\t'.repeat(500_000) + '\ta'
    headers.append('fhqwhgads', attack)
  })
})

test('Headers.prototype.getSetCookie', async (t) => {
  await t.test('Mutating the returned list does not affect the set-cookie list', (t) => {
    const h = new Headers([
      ['set-cookie', 'a=b'],
      ['set-cookie', 'c=d']
    ])

    const old = h.getSetCookie()
    h.getSetCookie().push('oh=no')
    const now = h.getSetCookie()

    t.assert.deepStrictEqual(old, now)
  })

  // https://github.com/nodejs/undici/issues/1935
  await t.test('When Headers are cloned, so are the cookies (single entry)', async (t) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Set-Cookie', 'test=onetwo')
      res.end('Hello World!')
    }).listen(0)

    await once(server, 'listening')
    t.after(closeServerAsPromise(server))

    const res = await fetch(`http://localhost:${server.address().port}`)
    const entries = Object.fromEntries(res.headers.entries())

    t.assert.deepStrictEqual(res.headers.getSetCookie(), ['test=onetwo'])
    t.assert.ok('set-cookie' in entries)
  })

  await t.test('When Headers are cloned, so are the cookies (multiple entries)', async (t) => {
    const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.setHeader('Set-Cookie', ['test=onetwo', 'test=onetwothree'])
      res.end('Hello World!')
    }).listen(0)

    await once(server, 'listening')
    t.after(closeServerAsPromise(server))

    const res = await fetch(`http://localhost:${server.address().port}`)
    const entries = Object.fromEntries(res.headers.entries())

    t.assert.deepStrictEqual(res.headers.getSetCookie(), ['test=onetwo', 'test=onetwothree'])
    t.assert.ok('set-cookie' in entries)
  })

  await t.test('When Headers are cloned, so are the cookies (Headers constructor)', (t) => {
    const headers = new Headers([['set-cookie', 'a'], ['set-cookie', 'b']])

    t.assert.deepStrictEqual([...headers], [...new Headers(headers)])
  })
})

test('When the value is updated, update the cache', (t) => {
  t.plan(2)
  const expected = [['a', 'a'], ['b', 'b'], ['c', 'c']]
  const headers = new Headers(expected)
  t.assert.deepStrictEqual([...headers], expected)
  headers.append('d', 'd')
  t.assert.deepStrictEqual([...headers], [...expected, ['d', 'd']])
})

test('Symbol.iterator is only accessed once', (t) => {
  t.plan(1)

  const dict = new Proxy({}, {
    get () {
      t.assert.ok(true)

      return function * () {}
    }
  })

  new Headers(dict) // eslint-disable-line no-new
})

test('Invalid Symbol.iterators', (t) => {
  t.plan(3)

  t.assert.throws(() => new Headers({ [Symbol.iterator]: null }), TypeError)
  t.assert.throws(() => new Headers({ [Symbol.iterator]: undefined }), TypeError)
  t.assert.throws(() => {
    const obj = { [Symbol.iterator]: null }
    Object.defineProperty(obj, Symbol.iterator, { enumerable: false })

    new Headers(obj) // eslint-disable-line no-new
  }, TypeError)
})

// https://github.com/nodejs/undici/issues/3829
test('Invalid key/value records passed to constructor (issue #3829)', (t) => {
  t.assert.throws(
    () => new Headers({ [Symbol('x-fake-header')]: '??' }),
    new TypeError('Headers constructor: Key Symbol(x-fake-header) in init is a symbol, which cannot be converted to a ByteString.')
  )

  t.assert.throws(
    () => new Headers({ 'x-fake-header': Symbol('why is this here?') }),
    new TypeError('Headers constructor: init["x-fake-header"] is a symbol, which cannot be converted to a ByteString.')
  )
})
