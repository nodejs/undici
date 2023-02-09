'use strict'

const tap = require('tap')
const { Headers, fill } = require('../../lib/fetch/headers')
const { kGuard } = require('../../lib/fetch/symbols')

tap.test('Headers initialization', t => {
  t.plan(8)

  t.test('allows undefined', t => {
    t.plan(1)

    t.doesNotThrow(() => new Headers())
  })

  t.test('with array of header entries', t => {
    t.plan(3)

    t.test('fails on invalid array-based init', t => {
      t.plan(3)
      t.throws(
        () => new Headers([['undici', 'fetch'], ['fetch']]),
        TypeError('Headers constructor: expected name/value pair to be length 2, found 1.')
      )
      t.throws(() => new Headers(['undici', 'fetch', 'fetch']), TypeError)
      t.throws(
        () => new Headers([0, 1, 2]),
        TypeError('Sequence: Value of type Number is not an Object.')
      )
    })

    t.test('allows even length init', t => {
      t.plan(1)
      const init = [['undici', 'fetch'], ['fetch', 'undici']]
      t.doesNotThrow(() => new Headers(init))
    })

    t.test('fails for event flattened init', t => {
      t.plan(1)
      const init = ['undici', 'fetch', 'fetch', 'undici']
      t.throws(
        () => new Headers(init),
        TypeError('Sequence: Value of type String is not an Object.')
      )
    })
  })

  t.test('with object of header entries', t => {
    t.plan(1)
    const init = {
      undici: 'fetch',
      fetch: 'undici'
    }
    t.doesNotThrow(() => new Headers(init))
  })

  t.test('fails silently if a boxed primitive object is passed', t => {
    t.plan(3)
    /* eslint-disable no-new-wrappers */
    t.doesNotThrow(() => new Headers(new Number()))
    t.doesNotThrow(() => new Headers(new Boolean()))
    t.doesNotThrow(() => new Headers(new String()))
    /* eslint-enable no-new-wrappers */
  })

  t.test('fails if primitive is passed', t => {
    t.plan(2)
    const expectedTypeError = TypeError
    t.throws(() => new Headers(1), expectedTypeError)
    t.throws(() => new Headers('1'), expectedTypeError)
  })

  t.test('allows some weird stuff (because of webidl)', t => {
    t.doesNotThrow(() => {
      new Headers(function () {}) // eslint-disable-line no-new
    })

    t.doesNotThrow(() => {
      new Headers(Function) // eslint-disable-line no-new
    })

    t.end()
  })

  t.test('allows a myriad of header values to be passed', t => {
    t.plan(4)

    // Headers constructor uses Headers.append

    t.doesNotThrow(() => new Headers([
      ['a', ['b', 'c']],
      ['d', ['e', 'f']]
    ]), 'allows any array values')
    t.doesNotThrow(() => new Headers([
      ['key', null]
    ]), 'allows null values')
    t.throws(() => new Headers([
      ['key']
    ]), 'throws when 2 arguments are not passed')
    t.throws(() => new Headers([
      ['key', 'value', 'value2']
    ]), 'throws when too many arguments are passed')
  })

  t.test('accepts headers as objects with array values', t => {
    t.plan(1)
    const headers = new Headers({
      c: '5',
      b: ['3', '4'],
      a: ['1', '2']
    })

    t.same([...headers.entries()], [
      ['a', '1,2'],
      ['b', '3,4'],
      ['c', '5']
    ])
  })
})

tap.test('Headers append', t => {
  t.plan(3)

  t.test('adds valid header entry to instance', t => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    t.doesNotThrow(() => headers.append(name, value))
    t.equal(headers.get(name), value)
  })

  t.test('adds valid header to existing entry', t => {
    t.plan(4)
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    const value3 = 'fetch3'
    headers.append(name, value1)
    t.equal(headers.get(name), value1)
    t.doesNotThrow(() => headers.append(name, value2))
    t.doesNotThrow(() => headers.append(name, value3))
    t.equal(headers.get(name), [value1, value2, value3].join(', '))
  })

  t.test('throws on invalid entry', t => {
    t.plan(3)
    const headers = new Headers()

    t.throws(() => headers.append(), 'throws on missing name and value')
    t.throws(() => headers.append('undici'), 'throws on missing value')
    t.throws(() => headers.append('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })
})

tap.test('Headers delete', t => {
  t.plan(3)

  t.test('deletes valid header entry from instance', t => {
    t.plan(3)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    t.equal(headers.get(name), value)
    t.doesNotThrow(() => headers.delete(name))
    t.equal(headers.get(name), null)
  })

  t.test('does not mutate internal list when no match is found', t => {
    t.plan(3)

    const headers = new Headers()
    const name = 'undici'
    const value = 'fetch'
    headers.append(name, value)
    t.equal(headers.get(name), value)
    t.doesNotThrow(() => headers.delete('not-undici'))
    t.equal(headers.get(name), value)
  })

  t.test('throws on invalid entry', t => {
    t.plan(2)
    const headers = new Headers()

    t.throws(() => headers.delete(), 'throws on missing namee')
    t.throws(() => headers.delete('invalid @ header ? name'), 'throws on invalid name')
  })
})

tap.test('Headers get', t => {
  t.plan(3)

  t.test('returns null if not found in instance', t => {
    t.plan(1)
    const headers = new Headers()
    headers.append('undici', 'fetch')

    t.equal(headers.get('not-undici'), null)
  })

  t.test('returns header values from valid header name', t => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'; const value1 = 'fetch1'; const value2 = 'fetch2'
    headers.append(name, value1)
    t.equal(headers.get(name), value1)
    headers.append(name, value2)
    t.equal(headers.get(name), [value1, value2].join(', '))
  })

  t.test('throws on invalid entry', t => {
    t.plan(2)
    const headers = new Headers()

    t.throws(() => headers.get(), 'throws on missing name')
    t.throws(() => headers.get('invalid @ header ? name'), 'throws on invalid name')
  })
})

tap.test('Headers has', t => {
  t.plan(2)

  t.test('returns boolean existence for a header name', t => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    headers.append('not-undici', 'fetch')
    t.equal(headers.has(name), false)
    headers.append(name, 'fetch')
    t.equal(headers.has(name), true)
  })

  t.test('throws on invalid entry', t => {
    t.plan(2)
    const headers = new Headers()

    t.throws(() => headers.has(), 'throws on missing name')
    t.throws(() => headers.has('invalid @ header ? name'), 'throws on invalid name')
  })
})

tap.test('Headers set', t => {
  t.plan(4)

  t.test('sets valid header entry to instance', t => {
    t.plan(2)
    const headers = new Headers()

    const name = 'undici'
    const value = 'fetch'
    headers.append('not-undici', 'fetch')
    t.doesNotThrow(() => headers.set(name, value))
    t.equal(headers.get(name), value)
  })

  t.test('overwrites existing entry', t => {
    t.plan(4)
    const headers = new Headers()

    const name = 'undici'
    const value1 = 'fetch1'
    const value2 = 'fetch2'
    t.doesNotThrow(() => headers.set(name, value1))
    t.equal(headers.get(name), value1)
    t.doesNotThrow(() => headers.set(name, value2))
    t.equal(headers.get(name), value2)
  })

  t.test('allows setting a myriad of values', t => {
    t.plan(4)
    const headers = new Headers()

    t.doesNotThrow(() => headers.set('a', ['b', 'c']), 'sets array values properly')
    t.doesNotThrow(() => headers.set('b', null), 'allows setting null values')
    t.throws(() => headers.set('c'), 'throws when 2 arguments are not passed')
    t.doesNotThrow(() => headers.set('c', 'd', 'e'), 'ignores extra arguments')
  })

  t.test('throws on invalid entry', t => {
    t.plan(3)
    const headers = new Headers()

    t.throws(() => headers.set(), 'throws on missing name and value')
    t.throws(() => headers.set('undici'), 'throws on missing value')
    t.throws(() => headers.set('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })
})

tap.test('Headers forEach', t => {
  const headers = new Headers([['a', 'b'], ['c', 'd']])

  t.test('standard', t => {
    t.equal(typeof headers.forEach, 'function')

    headers.forEach((value, key, headerInstance) => {
      t.ok(value === 'b' || value === 'd')
      t.ok(key === 'a' || key === 'c')
      t.equal(headers, headerInstance)
    })

    t.end()
  })

  t.test('when no thisArg is set, it is globalThis', (t) => {
    headers.forEach(function () {
      t.equal(this, globalThis)
    })

    t.end()
  })

  t.test('with thisArg', t => {
    const thisArg = { a: Math.random() }
    headers.forEach(function () {
      t.equal(this, thisArg)
    }, thisArg)

    t.end()
  })

  t.end()
})

tap.test('Headers as Iterable', t => {
  t.plan(7)

  t.test('should freeze values while iterating', t => {
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
    t.strictSame([...headers], expected)
  })

  t.test('returns combined and sorted entries using .forEach()', t => {
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
      t.strictSame(expected[i++], [key, value])
      t.equal(this, that)
    }, that)
  })

  t.test('returns combined and sorted entries using .entries()', t => {
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
      t.strictSame(header, expected[i++])
    }
  })

  t.test('returns combined and sorted keys using .keys()', t => {
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
      t.strictSame(key, expected[i++])
    }
  })

  t.test('returns combined and sorted values using .values()', t => {
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
      t.strictSame(value, expected[i++])
    }
  })

  t.test('returns combined and sorted entries using for...of loop', t => {
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
      t.strictSame(header, expected[i++])
    }
  })

  t.test('validate append ordering', t => {
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

    t.same([...headers], expected)
  })
})

tap.test('arg validation', (t) => {
  // fill
  t.throws(() => {
    fill({}, 0)
  }, TypeError)

  const headers = new Headers()

  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new Headers(0)
  }, TypeError)

  // get [Symbol.toStringTag]
  t.doesNotThrow(() => {
    Object.prototype.toString.call(Headers.prototype)
  })

  // toString
  t.doesNotThrow(() => {
    Headers.prototype.toString.call(null)
  })

  // append
  t.throws(() => {
    Headers.prototype.append.call(null)
  }, TypeError)
  t.throws(() => {
    headers.append()
  }, TypeError)

  // delete
  t.throws(() => {
    Headers.prototype.delete.call(null)
  }, TypeError)
  t.throws(() => {
    headers.delete()
  }, TypeError)

  // get
  t.throws(() => {
    Headers.prototype.get.call(null)
  }, TypeError)
  t.throws(() => {
    headers.get()
  }, TypeError)

  // has
  t.throws(() => {
    Headers.prototype.has.call(null)
  }, TypeError)
  t.throws(() => {
    headers.has()
  }, TypeError)

  // set
  t.throws(() => {
    Headers.prototype.set.call(null)
  }, TypeError)
  t.throws(() => {
    headers.set()
  }, TypeError)

  // forEach
  t.throws(() => {
    Headers.prototype.forEach.call(null)
  }, TypeError)
  t.throws(() => {
    headers.forEach()
  }, TypeError)
  t.throws(() => {
    headers.forEach(1)
  }, TypeError)

  // inspect
  t.throws(() => {
    Headers.prototype[Symbol.for('nodejs.util.inspect.custom')].call(null)
  }, TypeError)

  t.end()
})

tap.test('function signature verification', (t) => {
  t.test('function length', (t) => {
    t.equal(Headers.prototype.append.length, 2)
    t.equal(Headers.prototype.constructor.length, 0)
    t.equal(Headers.prototype.delete.length, 1)
    t.equal(Headers.prototype.entries.length, 0)
    t.equal(Headers.prototype.forEach.length, 1)
    t.equal(Headers.prototype.get.length, 1)
    t.equal(Headers.prototype.has.length, 1)
    t.equal(Headers.prototype.keys.length, 0)
    t.equal(Headers.prototype.set.length, 2)
    t.equal(Headers.prototype.values.length, 0)
    t.equal(Headers.prototype[Symbol.iterator].length, 0)
    t.equal(Headers.prototype.toString.length, 0)

    t.end()
  })

  t.test('function equality', (t) => {
    t.equal(Headers.prototype.entries, Headers.prototype[Symbol.iterator])
    t.equal(Headers.prototype.toString, Object.prototype.toString)

    t.end()
  })

  t.test('toString and Symbol.toStringTag', (t) => {
    t.equal(Object.prototype.toString.call(Headers.prototype), '[object Headers]')
    t.equal(Headers.prototype[Symbol.toStringTag], 'Headers')
    t.equal(Headers.prototype.toString.call(null), '[object Null]')

    t.end()
  })

  t.end()
})

tap.test('various init paths of Headers', (t) => {
  const h1 = new Headers()
  const h2 = new Headers({})
  const h3 = new Headers(undefined)
  t.equal([...h1.entries()].length, 0)
  t.equal([...h2.entries()].length, 0)
  t.equal([...h3.entries()].length, 0)

  t.end()
})

tap.test('immutable guard', (t) => {
  const headers = new Headers()
  headers.set('key', 'val')
  headers[kGuard] = 'immutable'

  t.throws(() => {
    headers.set('asd', 'asd')
  })
  t.throws(() => {
    headers.append('asd', 'asd')
  })
  t.throws(() => {
    headers.delete('asd')
  })
  t.equal(headers.get('key'), 'val')
  t.equal(headers.has('key'), true)

  t.end()
})

tap.test('request-no-cors guard', (t) => {
  const headers = new Headers()
  headers[kGuard] = 'request-no-cors'
  t.doesNotThrow(() => { headers.set('key', 'val') })
  t.doesNotThrow(() => { headers.append('key', 'val') })
  t.doesNotThrow(() => { headers.delete('key') })
  t.end()
})

tap.test('invalid headers', (t) => {
  for (const byte of ['\r', '\n', '\t', ' ', String.fromCharCode(128), '']) {
    t.throws(() => {
      new Headers().set(byte, 'test')
    }, TypeError, 'invalid header name')
  }

  for (const byte of [
    '\0',
    '\r',
    '\n'
  ]) {
    t.throws(() => {
      new Headers().set('a', `a${byte}b`)
    }, TypeError, 'not allowed at all in header value')
  }

  t.doesNotThrow(() => {
    new Headers().set('a', '\r')
  })

  t.doesNotThrow(() => {
    new Headers().set('a', '\n')
  })

  t.throws(() => {
    new Headers().set('a', Symbol('symbol'))
  }, TypeError, 'symbols should throw')

  t.end()
})

tap.test('Headers.prototype.getSetCookie', (t) => {
  t.test('Mutating the returned list does not affect the set-cookie list', (t) => {
    const h = new Headers([
      ['set-cookie', 'a=b'],
      ['set-cookie', 'c=d']
    ])

    const old = h.getSetCookie()
    h.getSetCookie().push('oh=no')
    const now = h.getSetCookie()

    t.same(old, now)
    t.end()
  })

  t.end()
})
