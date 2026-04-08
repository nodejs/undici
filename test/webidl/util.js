'use strict'

const { test } = require('node:test')
const { webidl } = require('../../lib/web/webidl')

test('webidl.util.Type(V)', (t) => {
  const Type = webidl.util.Type
  const Types = webidl.util.Types

  t.assert.strictEqual(Type(undefined), Types.UNDEFINED)
  t.assert.strictEqual(Type(null), Types.NULL)
  t.assert.strictEqual(Type(true), Types.BOOLEAN)
  t.assert.strictEqual(Type('string'), Types.STRING)
  t.assert.strictEqual(Type(Symbol('symbol')), Types.SYMBOL)
  t.assert.strictEqual(Type(1.23), Types.NUMBER)
  t.assert.strictEqual(Type(1n), Types.BIGINT)
  t.assert.strictEqual(Type({ a: 'b' }), Types.OBJECT)
  t.assert.strictEqual(Type(function () {}), Types.OBJECT)
  t.assert.strictEqual(Type([1, 2, 3]), Types.OBJECT)
})

test('webidl.util.Stringify(V)', (t) => {
  const circular = {}
  circular.circular = circular

  const pairs = [
    [Object.create(null), '[Object: null prototype] {}'],
    [{ a: 'b' }, "{ a: 'b' }"],
    [[1, 2, 3], '[ 1, 2, 3 ]'],
    [Symbol('sym'), 'Symbol(sym)'],
    [Symbol.iterator, 'Symbol(Symbol.iterator)'], // well-known symbol
    [true, 'true'],
    [false, 'false'],
    [1.23, '1.23'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
    [NaN, 'NaN'],
    [0, '0'],
    [1, '1'],
    [1.5, '1.5'],
    [1e10, '10000000000'],
    [1e-10, '1e-10'],
    [1e+10, '10000000000'],
    [1e-10, '1e-10'],
    [0, '0'],
    [-0, '0'],
    [1n, '1n'],
    ['hello', '"hello"'],
    ['', '""'],
    [function () {}, '[Function (anonymous)]'],
    [function named () {}, '[Function: named]'],
    [null, 'null'],
    [undefined, 'undefined'],
    [circular, '<ref *1> { circular: [Circular *1] }']
  ]

  for (const [value, expected] of pairs) {
    t.assert.deepStrictEqual(webidl.util.Stringify(value), expected)
  }
})

test('webidl.util.ConvertToInt(V)', (t) => {
  const ConvertToInt = webidl.util.ConvertToInt

  t.assert.strictEqual(ConvertToInt(63, 64, 'signed'), 63, 'odd int')
  t.assert.strictEqual(ConvertToInt(64.49, 64, 'signed'), 64)
  t.assert.strictEqual(ConvertToInt(64.51, 64, 'signed'), 64)

  const max = 2 ** 53
  t.assert.strictEqual(ConvertToInt(max + 1, 64, 'signed'), max, 'signed pos')
  t.assert.strictEqual(ConvertToInt(-max - 1, 64, 'signed'), -max, 'signed neg')

  t.assert.strictEqual(ConvertToInt(max + 1, 64, 'unsigned'), max + 1, 'unsigned pos')
  t.assert.strictEqual(ConvertToInt(-max - 1, 64, 'unsigned'), -max - 1, 'unsigned neg')

  for (const signedness of ['signed', 'unsigned']) {
    t.assert.strictEqual(ConvertToInt(Infinity, 64, signedness), 0)
    t.assert.strictEqual(ConvertToInt(-Infinity, 64, signedness), 0)
    t.assert.strictEqual(ConvertToInt(NaN, 64, signedness), 0)
  }

  for (const signedness of ['signed', 'unsigned']) {
    t.assert.throws(() => {
      ConvertToInt(NaN, 64, signedness, webidl.attributes.EnforceRange)
    }, TypeError)

    t.assert.throws(() => {
      ConvertToInt(Infinity, 64, signedness, webidl.attributes.EnforceRange)
    }, TypeError)

    t.assert.throws(() => {
      ConvertToInt(-Infinity, 64, signedness, webidl.attributes.EnforceRange)
    }, TypeError)

    t.assert.throws(() => {
      ConvertToInt(2 ** 53 + 1, 32, 'signed', webidl.attributes.EnforceRange)
    }, TypeError)

    t.assert.throws(() => {
      ConvertToInt(-(2 ** 53 + 1), 32, 'unsigned', webidl.attributes.EnforceRange)
    }, TypeError)

    t.assert.strictEqual(
      ConvertToInt(65.5, 64, signedness, webidl.attributes.EnforceRange),
      65
    )
  }

  for (const signedness of ['signed', 'unsigned']) {
    t.assert.strictEqual(
      ConvertToInt(63.49, 64, signedness, webidl.attributes.Clamp),
      64
    )

    t.assert.strictEqual(
      ConvertToInt(63.51, 64, signedness, webidl.attributes.Clamp),
      64
    )

    t.assert.strictEqual(
      ConvertToInt(-0, 64, signedness, webidl.attributes.Clamp),
      0
    )
  }

  t.assert.strictEqual(ConvertToInt(111, 2, 'signed'), -1)
})
