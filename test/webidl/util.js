'use strict'

const { test } = require('tap')
const { webidl } = require('../../lib/fetch/webidl')

test('Type(V)', (t) => {
  const Type = webidl.util.Type

  t.equal(Type(undefined), 'Undefined')
  t.equal(Type(null), 'Null')
  t.equal(Type(true), 'Boolean')
  t.equal(Type('string'), 'String')
  t.equal(Type(Symbol('symbol')), 'Symbol')
  t.equal(Type(1.23), 'Number')
  t.equal(Type(1n), 'BigInt')
  t.equal(Type({ a: 'b' }), 'Object')

  t.end()
})

test('ConvertToInt(V)', (t) => {
  const ConvertToInt = webidl.util.ConvertToInt

  t.equal(ConvertToInt(63, 64, 'signed'), 63, 'odd int')
  t.equal(ConvertToInt(64.49, 64, 'signed'), 64)
  t.equal(ConvertToInt(64.51, 64, 'signed'), 64)

  const max = 2 ** 53
  t.equal(ConvertToInt(max + 1, 64, 'signed'), max, 'signed pos')
  t.equal(ConvertToInt(-max - 1, 64, 'signed'), -max, 'signed neg')

  t.equal(ConvertToInt(max + 1, 64, 'unsigned'), max + 1, 'unsigned pos')
  t.equal(ConvertToInt(-max - 1, 64, 'unsigned'), -max - 1, 'unsigned neg')

  for (const signedness of ['signed', 'unsigned']) {
    t.equal(ConvertToInt(Infinity, 64, signedness), 0)
    t.equal(ConvertToInt(-Infinity, 64, signedness), 0)
    t.equal(ConvertToInt(NaN, 64, signedness), 0)
  }

  for (const signedness of ['signed', 'unsigned']) {
    t.throws(() => {
      ConvertToInt(NaN, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    t.throws(() => {
      ConvertToInt(Infinity, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    t.throws(() => {
      ConvertToInt(-Infinity, 64, signedness, {
        enforceRange: true
      })
    }, TypeError)

    t.throws(() => {
      ConvertToInt(2 ** 53 + 1, 32, 'signed', {
        enforceRange: true
      })
    }, TypeError)

    t.throws(() => {
      ConvertToInt(-(2 ** 53 + 1), 32, 'unsigned', {
        enforceRange: true
      })
    }, TypeError)

    t.equal(
      ConvertToInt(65.5, 64, signedness, {
        enforceRange: true
      }),
      65
    )
  }

  for (const signedness of ['signed', 'unsigned']) {
    t.equal(
      ConvertToInt(63.49, 64, signedness, {
        clamp: true
      }),
      64
    )

    t.equal(
      ConvertToInt(63.51, 64, signedness, {
        clamp: true
      }),
      64
    )

    t.equal(
      ConvertToInt(-0, 64, signedness, {
        clamp: true
      }),
      0
    )
  }

  t.equal(ConvertToInt(111, 2, 'signed'), -1)

  t.end()
})
