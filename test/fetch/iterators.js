'use strict'

const { test } = require('tap')
const { Headers, FormData } = require('../..')

test('Implements " Iterator" properly', (t) => {
  t.test('all Headers iterators implement Headers Iterator', (t) => {
    const headers = new Headers([['a', 'b'], ['c', 'd']])

    for (const iterable of ['keys', 'values', 'entries', Symbol.iterator]) {
      const gen = headers[iterable]()
      // https://tc39.es/ecma262/#sec-%25iteratorprototype%25-object
      const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
      const iteratorProto = Object.getPrototypeOf(gen)

      t.ok(gen.constructor === Object)
      t.ok(gen.prototype === undefined)
      // eslint-disable-next-line no-proto
      t.equal(gen.__proto__[Symbol.toStringTag], 'Headers Iterator')
      // https://github.com/node-fetch/node-fetch/issues/1119#issuecomment-100222049
      t.notOk(Headers.prototype[iterable] instanceof function * () {}.constructor)
      // eslint-disable-next-line no-proto
      t.ok(gen.__proto__.next.__proto__ === Function.prototype)
      // https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
      // "The [[Prototype]] internal slot of an iterator prototype object must be %IteratorPrototype%."
      t.equal(gen[Symbol.iterator], IteratorPrototype[Symbol.iterator])
      t.equal(Object.getPrototypeOf(iteratorProto), IteratorPrototype)
    }

    t.end()
  })

  t.test('all FormData iterators implement FormData Iterator', (t) => {
    const fd = new FormData()

    for (const iterable of ['keys', 'values', 'entries', Symbol.iterator]) {
      const gen = fd[iterable]()
      // https://tc39.es/ecma262/#sec-%25iteratorprototype%25-object
      const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
      const iteratorProto = Object.getPrototypeOf(gen)

      t.ok(gen.constructor === Object)
      t.ok(gen.prototype === undefined)
      // eslint-disable-next-line no-proto
      t.equal(gen.__proto__[Symbol.toStringTag], 'FormData Iterator')
      // https://github.com/node-fetch/node-fetch/issues/1119#issuecomment-100222049
      t.notOk(Headers.prototype[iterable] instanceof function * () {}.constructor)
      // eslint-disable-next-line no-proto
      t.ok(gen.__proto__.next.__proto__ === Function.prototype)
      // https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
      // "The [[Prototype]] internal slot of an iterator prototype object must be %IteratorPrototype%."
      t.equal(gen[Symbol.iterator], IteratorPrototype[Symbol.iterator])
      t.equal(Object.getPrototypeOf(iteratorProto), IteratorPrototype)
    }

    t.end()
  })

  t.test('Iterator symbols are properly set', (t) => {
    t.test('Headers', (t) => {
      const headers = new Headers([['a', 'b'], ['c', 'd']])
      const gen = headers.entries()

      t.equal(typeof gen[Symbol.toStringTag], 'string')
      t.equal(typeof gen[Symbol.iterator], 'function')
      t.end()
    })

    t.test('FormData', (t) => {
      const fd = new FormData()
      const gen = fd.entries()

      t.equal(typeof gen[Symbol.toStringTag], 'string')
      t.equal(typeof gen[Symbol.iterator], 'function')
      t.end()
    })

    t.end()
  })

  t.test('Iterator does not inherit Generator prototype methods', (t) => {
    t.test('Headers', (t) => {
      const headers = new Headers([['a', 'b'], ['c', 'd']])
      const gen = headers.entries()

      t.equal(gen.return, undefined)
      t.equal(gen.throw, undefined)
      t.equal(typeof gen.next, 'function')

      t.end()
    })

    t.test('FormData', (t) => {
      const fd = new FormData()
      const gen = fd.entries()

      t.equal(gen.return, undefined)
      t.equal(gen.throw, undefined)
      t.equal(typeof gen.next, 'function')

      t.end()
    })

    t.end()
  })

  t.test('Symbol.iterator', (t) => {
    // Headers
    const headerValues = new Headers([['a', 'b']]).entries()[Symbol.iterator]()
    t.same(Array.from(headerValues), [['a', 'b']])

    // FormData
    const formdata = new FormData()
    formdata.set('a', 'b')
    const formdataValues = formdata.entries()[Symbol.iterator]()
    t.same(Array.from(formdataValues), [['a', 'b']])

    t.end()
  })

  t.test('brand check', (t) => {
    // Headers
    t.throws(() => {
      const gen = new Headers().entries()
      // eslint-disable-next-line no-proto
      gen.__proto__.next()
    }, TypeError)

    // FormData
    t.throws(() => {
      const gen = new FormData().entries()
      // eslint-disable-next-line no-proto
      gen.__proto__.next()
    }, TypeError)

    t.end()
  })

  t.end()
})
