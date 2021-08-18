'use strict'

const tap = require('tap')
const {
  Headers,
  normalizeAndValidateHeaderName,
  normalizeAndValidateHeaderValue,
  binarySearch
} = require('../../lib/fetch/headers')
const { kHeadersList } = require('../../lib/core/symbols')

tap.test('Headers initialization', t => {
  t.plan(6)

  t.test('allows undefined', t => {
    t.plan(1)

    t.doesNotThrow(() => new Headers())
  })

  t.test('with array of header entries', t => {
    t.plan(3)

    t.test('fails on invalid array-based init', t => {
      t.plan(3)
      t.throws(() => new Headers([['undici', 'fetch'], ['fetch']]), TypeError())
      t.throws(() => new Headers(['undici', 'fetch', 'fetch']), TypeError())
      t.throws(() => new Headers([0, 1, 2]), TypeError())
    })

    t.test('allows even length init', t => {
      t.plan(1)
      const init = [['undici', 'fetch'], ['fetch', 'undici']]
      t.doesNotThrow(() => new Headers(init))
    })

    t.test('fails for event flattened init', t => {
      t.plan(1)
      const init = ['undici', 'fetch', 'fetch', 'undici']
      t.throws(() => new Headers(init), TypeError())
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

  t.test('fails if function or primitive is passed', t => {
    t.plan(4)
    const expectedTypeError = TypeError("Failed to construct 'Headers': The provided value is not of type '(record<ByteString, ByteString> or sequence<sequence<ByteString>>")
    t.throws(() => new Headers(Function), expectedTypeError)
    t.throws(() => new Headers(function () {}), expectedTypeError)
    t.throws(() => new Headers(1), expectedTypeError)
    t.throws(() => new Headers('1'), expectedTypeError)
  })

  t.test('allows a myriad of header values to be passed', t => {
    t.plan(5)

    // Headers constructor uses Headers.append

    t.doesNotThrow(() => new Headers([
      ['a', ['b', 'c']],
      ['d', ['e', 'f']]
    ]), 'allows any array values')
    t.doesNotThrow(() => new Headers([
      ['key', null]
    ]), 'allows null values')
    t.doesNotThrow(() => new Headers([
      ['key', Symbol('undici-fetch')]
    ]), 'allows Symbol values')
    t.throws(() => new Headers([
      ['key']
    ]), 'throws when 2 arguments are not passed')
    t.throws(() => new Headers([
      ['key', 'value', 'value2']
    ]), 'throws when too many arguments are passed')
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

  t.test('returns boolean existance for a header name', t => {
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
    t.plan(5)
    const headers = new Headers()

    t.doesNotThrow(() => headers.set('a', ['b', 'c']), 'sets array values properly')
    t.doesNotThrow(() => headers.set('b', null), 'allows setting null values')
    t.throws(() => headers.set('c'), 'throws when 2 arguments are not passed')
    t.doesNotThrow(() => headers.set('c', 'd', 'e'), 'ignores extra arguments')
    t.doesNotThrow(() => headers.set('f', Symbol('g'), 'allows Symbol value'))
  })

  t.test('throws on invalid entry', t => {
    t.plan(3)
    const headers = new Headers()

    t.throws(() => headers.set(), 'throws on missing name and value')
    t.throws(() => headers.set('undici'), 'throws on missing value')
    t.throws(() => headers.set('invalid @ header ? name', 'valid value'), 'throws on invalid name')
  })
})

tap.test('Headers as Iterable', t => {
  t.plan(6)

  t.test('returns combined and sorted entries using .forEach()', t => {
    t.plan(12)
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
      t.equal(headers, _headers)
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

    const expected = [
      'a', '1',
      'abc', '8',
      'b', '2',
      'c', '3, 7',
      'd', '4',
      'e', '5',
      'f', '6'
    ]

    t.same(headers[kHeadersList], expected)
  })
})

tap.test('Headers normalize and validate', t => {
  t.plan(2)
  const name = 'UNDICI'
  const value = '    fetch	' // eslint-disable-line no-tabs
  t.equal(
    normalizeAndValidateHeaderName(name),
    'undici'
  )
  t.strictSame(
    normalizeAndValidateHeaderValue(name, value),
    'fetch'
  )
})

tap.test('binary search', t => {
  //           0   1   2   3   4   5   6   7
  const l1 = ['b', 1, 'c', 2, 'd', 3, 'f', 4]
  //           0   1   2   3   4   5   6   7   8   9
  const l2 = ['b', 1, 'c', 2, 'd', 3, 'e', 4, 'g', 5]
  //           0   1   2   3    4    5   6   7
  const l3 = ['a', 1, 'b', 2, 'bcd', 3, 'c', 4]
  //           0   1   2   3   4   5    6    7   8   9
  const l4 = ['a', 1, 'b', 2, 'c', 3, 'cde', 4, 'f', 5]

  const tests = [
    { input: [l1, 'c'], expected: 2, message: 'find item in n=even array' },
    { input: [l1, 'f'], expected: 6, message: 'find item at end of n=even array' },
    { input: [l1, 'b'], expected: 0, message: 'find item at beg of n=even array' },
    { input: [l1, 'e'], expected: 6, message: 'find new item position in n=even array' },
    { input: [l1, 'g'], expected: 8, message: 'find new item position at end of n=even array' },
    { input: [l1, 'a'], expected: 0, message: 'find new item position at beg of n=even array' },
    { input: [l2, 'c'], expected: 2, message: 'find item in n=odd array' },
    { input: [l2, 'g'], expected: 8, message: 'find item at end of n=odd array' },
    { input: [l2, 'b'], expected: 0, message: 'find item at beg of n=odd array' },
    { input: [l2, 'f'], expected: 8, message: 'find new item position in n=odd array' },
    { input: [l2, 'h'], expected: 10, message: 'find new item position at end of n=odd array' },
    { input: [l2, 'a'], expected: 0, message: 'find new item position at beg of n=odd array' },
    { input: [l3, 'b'], expected: 2, message: 'find item with similarity in n=odd array' },
    { input: [l3, 'bcd'], expected: 4, message: 'find item with similarity in n=odd array' },
    { input: [l4, 'c'], expected: 4, message: 'find item with similarity in n=odd array' },
    { input: [l4, 'cde'], expected: 6, message: 'find item with similarity in n=odd array' }
  ]

  t.plan(tests.length)

  tests.forEach(({ input: [list, target], expected, message }) => {
    t.equal(expected, binarySearch(list, target), message)
  })
})
