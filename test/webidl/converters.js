'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { webidl } = require('../../lib/web/fetch/webidl')

test('sequence', () => {
  const converter = webidl.sequenceConverter(
    webidl.converters.DOMString
  )

  assert.deepStrictEqual(converter([1, 2, 3]), ['1', '2', '3'])

  assert.throws(() => {
    converter(3, 'converter', 'converter')
  }, TypeError, 'disallows non-objects')

  assert.throws(() => {
    converter(null, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    converter(undefined, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    converter({}, 'converter', 'converter')
  }, TypeError, 'no Symbol.iterator')

  assert.throws(() => {
    converter({
      [Symbol.iterator]: 42
    })
  }, TypeError, 'invalid Symbol.iterator')

  assert.throws(() => {
    converter(webidl.converters.sequence({
      [Symbol.iterator] () {
        return {
          next: 'never!'
        }
      }
    }), 'converter', 'converter')
  }, TypeError, 'invalid generator')
})

describe('webidl.dictionaryConverter', () => {
  test('arguments', () => {
    const converter = webidl.dictionaryConverter([])

    assert.throws(() => {
      converter(true, 'converter', 'converter')
    }, TypeError)

    for (const value of [{}, undefined, null]) {
      assert.doesNotThrow(() => {
        converter(value, 'converter', 'converter')
      })
    }
  })

  test('required key', () => {
    const converter = webidl.dictionaryConverter([
      {
        converter: () => true,
        key: 'Key',
        required: true
      }
    ])

    assert.throws(() => {
      converter({ wrongKey: 'key' }, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      converter({ Key: 'this key was required!' }, 'converter', 'converter')
    })
  })

  test('null and undefined still populates defaultValue(s)', () => {
    const dict = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.any,
        defaultValue: () => 3
      }
    ])

    assert.deepStrictEqual(dict(null), { key: 3 })
    assert.deepStrictEqual(dict(undefined), { key: 3 })
  })

  test('null and undefined throw a webidl TypeError with a required key', () => {
    const dict = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.any,
        required: true
      }
    ])

    assert.throws(() => dict(null, 'prefix'), new TypeError('prefix: Missing required key "key".'))
    assert.throws(() => dict(undefined, 'prefix'), new TypeError('prefix: Missing required key "key".'))
  })

  test('Object type works for functions and regex (etc.)', () => {
    const dict = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.any,
        required: true
      }
    ])

    function obj () {}
    obj.key = 1

    const obj2 = / /
    obj2.key = 1

    assert.deepStrictEqual(dict(obj), { key: 1 })
    assert.deepStrictEqual(dict(obj2), { key: 1 })
  })
})

test('ArrayBuffer', () => {
  assert.throws(() => {
    webidl.converters.ArrayBuffer(true, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    webidl.converters.ArrayBuffer({}, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab, 'converter', 'converter', { allowShared: false })
  }, TypeError)

  assert.doesNotThrow(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab, 'converter', 'converter')
  })

  assert.doesNotThrow(() => {
    const ab = new ArrayBuffer(8)
    webidl.converters.ArrayBuffer(ab, 'converter', 'converter')
  })
})

test('TypedArray', () => {
  assert.throws(() => {
    webidl.converters.TypedArray(3, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    webidl.converters.TypedArray({}, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    const uint8 = new Uint8Array([1, 2, 3])
    Object.defineProperty(uint8, 'buffer', {
      get () {
        return new SharedArrayBuffer(8)
      }
    })

    webidl.converters.TypedArray(uint8, Uint8Array, 'converter', 'converter', {
      allowShared: false
    })
  }, TypeError)
})

test('DataView', () => {
  assert.throws(() => {
    webidl.converters.DataView(3, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    webidl.converters.DataView({}, 'converter', 'converter')
  }, TypeError)

  assert.throws(() => {
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer, 0)

    Object.defineProperty(view, 'buffer', {
      get () {
        return new SharedArrayBuffer(8)
      }
    })

    webidl.converters.DataView(view, 'converter', 'converter', {
      allowShared: false
    })
  })

  const buffer = new ArrayBuffer(16)
  const view = new DataView(buffer, 0)

  assert.equal(webidl.converters.DataView(view, 'converter', 'converter'), view)
})

test('ByteString', () => {
  assert.doesNotThrow(() => {
    webidl.converters.ByteString('', 'converter', 'converter')
  })

  // https://github.com/nodejs/undici/issues/1590
  assert.throws(() => {
    const char = String.fromCharCode(256)
    webidl.converters.ByteString(`invalid${char}char`, 'converter', 'converter')
  }, {
    message: 'Cannot convert argument to a ByteString because the character at ' +
             'index 7 has a value of 256 which is greater than 255.'
  })
})

test('webidl.util.Stringify', (t) => {
  const circular = {}
  circular.circular = circular

  const pairs = [
    [Object.create(null), '[Object: null prototype] {}'],
    [{ a: 'b' }, "{ a: 'b' }"],
    [Symbol('sym'), 'Symbol(sym)'],
    [Symbol.iterator, 'Symbol(Symbol.iterator)'], // well-known symbol
    [true, 'true'],
    [0, '0'],
    ['hello', '"hello"'],
    ['', '""'],
    [null, 'null'],
    [undefined, 'undefined'],
    [circular, '<ref *1> { circular: [Circular *1] }']
  ]

  for (const [value, expected] of pairs) {
    assert.deepStrictEqual(webidl.util.Stringify(value), expected)
  }
})

test('recordConverter', () => {
  const anyConverter = webidl.recordConverter(webidl.converters.any, webidl.converters.any)

  assert.throws(
    () => anyConverter(null, 'prefix', 'argument'),
    new TypeError('prefix: argument ("Null") is not an Object.')
  )
})
