'use strict'

const { test } = require('node:test')
const { Headers, FormData } = require('../..')

test('Implements " Iterator" properly', async (t) => {
  await t.test('all Headers iterators implement Headers Iterator', () => {
    const headers = new Headers([['a', 'b'], ['c', 'd']])

    for (const iterable of ['keys', 'values', 'entries', Symbol.iterator]) {
      const gen = headers[iterable]()
      // https://tc39.es/ecma262/#sec-%25iteratorprototype%25-object
      const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
      const iteratorProto = Object.getPrototypeOf(gen)

      t.assert.ok(gen.constructor === IteratorPrototype.constructor)
      t.assert.ok(gen.prototype === undefined)
      // eslint-disable-next-line no-proto
      t.assert.strictEqual(gen.__proto__[Symbol.toStringTag], 'Headers Iterator')
      // https://github.com/node-fetch/node-fetch/issues/1119#issuecomment-100222049
      t.assert.ok(!(Headers.prototype[iterable] instanceof function * () {}.constructor))
      // eslint-disable-next-line no-proto
      t.assert.ok(gen.__proto__.next.__proto__ === Function.prototype)
      // https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
      // "The [[Prototype]] internal slot of an iterator prototype object must be %IteratorPrototype%."
      t.assert.strictEqual(gen[Symbol.iterator], IteratorPrototype[Symbol.iterator])
      t.assert.strictEqual(Object.getPrototypeOf(iteratorProto), IteratorPrototype)
    }
  })

  await t.test('all FormData iterators implement FormData Iterator', () => {
    const fd = new FormData()

    for (const iterable of ['keys', 'values', 'entries', Symbol.iterator]) {
      const gen = fd[iterable]()
      // https://tc39.es/ecma262/#sec-%25iteratorprototype%25-object
      const IteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
      const iteratorProto = Object.getPrototypeOf(gen)

      t.assert.ok(gen.constructor === IteratorPrototype.constructor)
      t.assert.ok(gen.prototype === undefined)
      // eslint-disable-next-line no-proto
      t.assert.strictEqual(gen.__proto__[Symbol.toStringTag], 'FormData Iterator')
      // https://github.com/node-fetch/node-fetch/issues/1119#issuecomment-100222049
      t.assert.ok(!(Headers.prototype[iterable] instanceof function * () {}.constructor))
      // eslint-disable-next-line no-proto
      t.assert.ok(gen.__proto__.next.__proto__ === Function.prototype)
      // https://webidl.spec.whatwg.org/#dfn-iterator-prototype-object
      // "The [[Prototype]] internal slot of an iterator prototype object must be %IteratorPrototype%."
      t.assert.strictEqual(gen[Symbol.iterator], IteratorPrototype[Symbol.iterator])
      t.assert.strictEqual(Object.getPrototypeOf(iteratorProto), IteratorPrototype)
    }
  })

  await t.test('Iterator symbols are properly set', async (t) => {
    await t.test('Headers', () => {
      const headers = new Headers([['a', 'b'], ['c', 'd']])
      const gen = headers.entries()

      t.assert.strictEqual(typeof gen[Symbol.toStringTag], 'string')
      t.assert.strictEqual(typeof gen[Symbol.iterator], 'function')
    })

    await t.test('FormData', () => {
      const fd = new FormData()
      const gen = fd.entries()

      t.assert.strictEqual(typeof gen[Symbol.toStringTag], 'string')
      t.assert.strictEqual(typeof gen[Symbol.iterator], 'function')
    })
  })

  await t.test('Iterator does not inherit Generator prototype methods', async (t) => {
    await t.test('Headers', () => {
      const headers = new Headers([['a', 'b'], ['c', 'd']])
      const gen = headers.entries()

      t.assert.strictEqual(gen.return, undefined)
      t.assert.strictEqual(gen.throw, undefined)
      t.assert.strictEqual(typeof gen.next, 'function')
    })

    await t.test('FormData', () => {
      const fd = new FormData()
      const gen = fd.entries()

      t.assert.strictEqual(gen.return, undefined)
      t.assert.strictEqual(gen.throw, undefined)
      t.assert.strictEqual(typeof gen.next, 'function')
    })
  })

  await t.test('Symbol.iterator', () => {
    // Headers
    const headerValues = new Headers([['a', 'b']]).entries()[Symbol.iterator]()
    t.assert.deepStrictEqual(Array.from(headerValues), [['a', 'b']])

    // FormData
    const formdata = new FormData()
    formdata.set('a', 'b')
    const formdataValues = formdata.entries()[Symbol.iterator]()
    t.assert.deepStrictEqual(Array.from(formdataValues), [['a', 'b']])
  })

  await t.test('brand check', () => {
    // Headers
    t.assert.throws(() => {
      const gen = new Headers().entries()
      // eslint-disable-next-line no-proto
      gen.__proto__.next()
    }, TypeError)

    // FormData
    t.assert.throws(() => {
      const gen = new FormData().entries()
      // eslint-disable-next-line no-proto
      gen.__proto__.next()
    }, TypeError)
  })
})
