'use strict'

const assert = require('node:assert')
const { describe, it } = require('node:test')
const { format } = require('node:util')
const { Headers } = require('../../index.js')

describe('Headers', () => {
  it('should have attributes conforming to Web IDL', () => {
    const headers = new Headers()
    assert.strictEqual(Object.getOwnPropertyNames(headers).length, 0)
    const enumerableProperties = []

    for (const property in headers) {
      enumerableProperties.push(property)
    }

    for (const toCheck of [
      'append',
      'delete',
      'entries',
      'forEach',
      'get',
      'has',
      'keys',
      'set',
      'values'
    ]) {
      assert.strictEqual(enumerableProperties.includes(toCheck), true)
    }
  })

  it('should allow iterating through all headers with forEach', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['b', '3'],
      ['a', '1']
    ])
    assert.strictEqual(typeof headers.forEach, 'function')

    const result = []
    for (const [key, value] of headers.entries()) {
      result.push([key, value])
    }

    assert.deepStrictEqual(result, [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4']
    ])
  })

  it('should be iterable with forEach', () => {
    const headers = new Headers()
    headers.append('Accept', 'application/json')
    headers.append('Accept', 'text/plain')
    headers.append('Content-Type', 'text/html')

    const results = []
    headers.forEach((value, key, object) => {
      results.push({ value, key, object })
    })

    assert.strictEqual(results.length, 2)
    assert.deepStrictEqual(results[0], { key: 'accept', value: 'application/json, text/plain', object: headers })
    assert.deepStrictEqual(results[1], { key: 'content-type', value: 'text/html', object: headers })
  })

  it.skip('should set "this" to undefined by default on forEach', () => {
    const headers = new Headers({ Accept: 'application/json' })
    headers.forEach(function () {
      assert.strictEqual(this, undefined)
    })
  })

  it('should accept thisArg as a second argument for forEach', () => {
    const headers = new Headers({ Accept: 'application/json' })
    const thisArg = {}
    headers.forEach(function () {
      assert.strictEqual(this, thisArg)
    }, thisArg)
  })

  it('should allow iterating through all headers with for-of loop', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['a', '1']
    ])
    headers.append('b', '3')
    assert.strictEqual(typeof headers[Symbol.iterator], 'function')

    const result = []
    for (const pair of headers) {
      result.push(pair)
    }

    assert.deepStrictEqual(result, [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4']
    ])
  })

  it('should allow iterating through all headers with entries()', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['a', '1']
    ])
    headers.append('b', '3')

    assert.strictEqual(typeof headers.entries, 'function')
    assert.strictEqual(typeof headers.entries()[Symbol.iterator], 'function')

    const entries = headers.entries()
    assert.strictEqual(typeof entries.next, 'function')
    assert.deepStrictEqual(entries.next().value, ['a', '1'])
    assert.strictEqual(typeof entries.next, 'function')
    assert.deepStrictEqual(entries.next().value, ['b', '2, 3'])
    assert.strictEqual(typeof entries.next, 'function')
    assert.deepStrictEqual(entries.next().value, ['c', '4'])

    assert.deepStrictEqual([...headers.entries()], [
      ['a', '1'],
      ['b', '2, 3'],
      ['c', '4']
    ])
  })

  it('should allow iterating through all headers with keys()', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['a', '1']
    ])
    headers.append('b', '3')

    assert.strictEqual(typeof headers.keys, 'function')
    assert.strictEqual(typeof headers.keys()[Symbol.iterator], 'function')

    const keys = headers.keys()
    assert.strictEqual(typeof keys.next, 'function')
    assert.strictEqual(keys.next().value, 'a')
    assert.strictEqual(typeof keys.next, 'function')
    assert.strictEqual(keys.next().value, 'b')
    assert.strictEqual(typeof keys.next, 'function')
    assert.strictEqual(keys.next().value, 'c')

    assert.deepStrictEqual([...headers.keys()], ['a', 'b', 'c'])
  })

  it('should allow iterating through all headers with values()', () => {
    const headers = new Headers([
      ['b', '2'],
      ['c', '4'],
      ['a', '1']
    ])
    headers.append('b', '3')

    assert.strictEqual(typeof headers.values, 'function')
    assert.strictEqual(typeof headers.values()[Symbol.iterator], 'function')

    const values = headers.values()
    assert.strictEqual(typeof values.next, 'function')
    assert.strictEqual(values.next().value, '1')
    assert.strictEqual(typeof values.next, 'function')
    assert.strictEqual(values.next().value, '2, 3')
    assert.strictEqual(typeof values.next, 'function')
    assert.strictEqual(values.next().value, '4')

    assert.deepStrictEqual([...headers.values()], ['1', '2, 3', '4'])
  })

  it('should reject illegal header', () => {
    const headers = new Headers()

    assert.throws(() => new Headers({ 'He y': 'ok' }), TypeError)
    assert.throws(() => new Headers({ 'Hé-y': 'ok' }), TypeError)
    assert.throws(() => new Headers({ 'He-y': 'ăk' }), TypeError)
    assert.throws(() => headers.append('Hé-y', 'ok'), TypeError)
    assert.throws(() => headers.delete('Hé-y'), TypeError)
    assert.throws(() => headers.get('Hé-y'), TypeError)
    assert.throws(() => headers.has('Hé-y'), TypeError)
    assert.throws(() => headers.set('Hé-y', 'ok'), TypeError)
    // Should reject empty header
    assert.throws(() => headers.append('', 'ok'), TypeError)
  })

  it.skip('should ignore unsupported attributes while reading headers', () => {
    const FakeHeader = function () { }
    // Prototypes are currently ignored
    // This might change in the future: #181
    FakeHeader.prototype.z = 'fake'

    const res = new FakeHeader()
    res.a = 'string'
    res.b = ['1', '2']
    res.c = ''
    res.d = []
    res.e = 1
    res.f = [1, 2]
    res.g = { a: 1 }
    res.h = undefined
    res.i = null
    res.j = Number.NaN
    res.k = true
    res.l = false
    res.m = Buffer.from('test')

    const h1 = new Headers(res)
    h1.set('n', [1, 2])
    h1.append('n', ['3', 4])

    const h1Raw = h1.raw()

    assert.strictEqual(h1Raw.a.includes('string'), true)
    assert.strictEqual(h1Raw.b.includes('1,2'), true)
    assert.strictEqual(h1Raw.c.includes(''), true)
    assert.strictEqual(h1Raw.d.includes(''), true)
    assert.strictEqual(h1Raw.e.includes('1'), true)
    assert.strictEqual(h1Raw.f.includes('1,2'), true)
    assert.strictEqual(h1Raw.g.includes('[object Object]'), true)
    assert.strictEqual(h1Raw.h.includes('undefined'), true)
    assert.strictEqual(h1Raw.i.includes('null'), true)
    assert.strictEqual(h1Raw.j.includes('NaN'), true)
    assert.strictEqual(h1Raw.k.includes('true'), true)
    assert.strictEqual(h1Raw.l.includes('false'), true)
    assert.strictEqual(h1Raw.m.includes('test'), true)
    assert.strictEqual(h1Raw.n.includes('1,2'), true)
    assert.strictEqual(h1Raw.n.includes('3,4'), true)

    assert.strictEqual(h1Raw.z, undefined)
  })

  it.skip('should wrap headers', () => {
    const h1 = new Headers({
      a: '1'
    })
    const h1Raw = h1.raw()

    const h2 = new Headers(h1)
    h2.set('b', '1')
    const h2Raw = h2.raw()

    const h3 = new Headers(h2)
    h3.append('a', '2')
    const h3Raw = h3.raw()

    assert.strictEqual(h1Raw.a.includes('1'), true)
    assert.strictEqual(h1Raw.a.includes('2'), false)

    assert.strictEqual(h2Raw.a.includes('1'), true)
    assert.strictEqual(h2Raw.a.includes('2'), false)
    assert.strictEqual(h2Raw.b.includes('1'), true)

    assert.strictEqual(h3Raw.a.includes('1'), true)
    assert.strictEqual(h3Raw.a.includes('2'), true)
    assert.strictEqual(h3Raw.b.includes('1'), true)
  })

  it('should accept headers as an iterable of tuples', () => {
    let headers

    headers = new Headers([
      ['a', '1'],
      ['b', '2'],
      ['a', '3']
    ])
    assert.strictEqual(headers.get('a'), '1, 3')
    assert.strictEqual(headers.get('b'), '2')

    headers = new Headers([
      new Set(['a', '1']),
      ['b', '2'],
      new Map([['a', null], ['3', null]]).keys()
    ])
    assert.strictEqual(headers.get('a'), '1, 3')
    assert.strictEqual(headers.get('b'), '2')

    headers = new Headers(new Map([
      ['a', '1'],
      ['b', '2']
    ]))
    assert.strictEqual(headers.get('a'), '1')
    assert.strictEqual(headers.get('b'), '2')
  })

  it('should throw a TypeError if non-tuple exists in a headers initializer', () => {
    assert.throws(() => new Headers([['b', '2', 'huh?']]), TypeError)
    assert.throws(() => new Headers(['b2']), TypeError)
    assert.throws(() => new Headers('b2'), TypeError)
    assert.throws(() => new Headers({ [Symbol.iterator]: 42 }), TypeError)
  })

  it.skip('should use a custom inspect function', () => {
    const headers = new Headers([
      ['Host', 'thehost'],
      ['Host', 'notthehost'],
      ['a', '1'],
      ['b', '2'],
      ['a', '3']
    ])

    assert.strictEqual(format(headers), "{ a: [ '1', '3' ], b: '2', host: 'thehost' }")
  })
})
