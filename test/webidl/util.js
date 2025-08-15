'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { webidl } = require('../../lib/web/webidl')

test('webidl.util.Type(V)', () => {
  const Type = webidl.util.Type
  const Types = webidl.util.Types

  assert.equal(Type(undefined), Types.UNDEFINED)
  assert.equal(Type(null), Types.NULL)
  assert.equal(Type(true), Types.BOOLEAN)
  assert.equal(Type('string'), Types.STRING)
  assert.equal(Type(Symbol('symbol')), Types.SYMBOL)
  assert.equal(Type(1.23), Types.NUMBER)
  assert.equal(Type(1n), Types.BIGINT)
  assert.equal(Type({ a: 'b' }), Types.OBJECT)
  assert.equal(Type(function () {}), Types.OBJECT)
  assert.equal(Type([1, 2, 3]), Types.OBJECT)
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
    assert.deepStrictEqual(webidl.util.Stringify(value), expected)
  }
})

test('webidl.util.ConvertToInt(V)', () => {
  const ConvertToInt = webidl.util.ConvertToInt

  assert.equal(ConvertToInt(63, 64, 'signed'), 63, 'odd int')
  assert.equal(ConvertToInt(64.49, 64, 'signed'), 64)
  assert.equal(ConvertToInt(64.51, 64, 'signed'), 64)

  const max = 2 ** 53
  assert.equal(ConvertToInt(max + 1, 64, 'signed'), max, 'signed pos')
  assert.equal(ConvertToInt(-max - 1, 64, 'signed'), -max, 'signed neg')

  assert.equal(ConvertToInt(max + 1, 64, 'unsigned'), max + 1, 'unsigned pos')
  assert.equal(ConvertToInt(-max - 1, 64, 'unsigned'), -max - 1, 'unsigned neg')

  for (const signedness of ['signed', 'unsigned']) {
    assert.equal(ConvertToInt(Infinity, 64, signedness), 0)
    assert.equal(ConvertToInt(-Infinity, 64, signedness), 0)
    assert.equal(ConvertToInt(NaN, 64, signedness), 0)
  }

  for (const signedness of ['signed', 'unsigned']) {
    assert.throws(() => {
      ConvertToInt(NaN, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    assert.throws(() => {
      ConvertToInt(Infinity, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    assert.throws(() => {
      ConvertToInt(-Infinity, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    assert.throws(() => {
      ConvertToInt(2 ** 53 + 1, 32, 'signed', {
        enforceRange: true
      })
    }, TypeError)

    assert.throws(() => {
      ConvertToInt(-(2 ** 53 + 1), 32, 'unsigned', {
        enforceRange: true
      })
    }, TypeError)

    assert.equal(
      ConvertToInt(65.5, 64, signedness, {
        enforceRange: true
      }),
      65
    )
  }

  for (const signedness of ['signed', 'unsigned']) {
    assert.equal(
      ConvertToInt(63.49, 64, signedness, {
        clamp: true
      }),
      64
    )

    assert.equal(
      ConvertToInt(63.51, 64, signedness, {
        clamp: true
      }),
      64
    )

    assert.equal(
      ConvertToInt(-0, 64, signedness, {
        clamp: true
      }),
      0
    )
  }

  assert.equal(ConvertToInt(111, 2, 'signed'), -1)
})
