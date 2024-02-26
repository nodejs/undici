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
    converter(3)
  }, TypeError, 'disallows non-objects')

  assert.throws(() => {
    converter(null)
  }, TypeError)

  assert.throws(() => {
    converter(undefined)
  }, TypeError)

  assert.throws(() => {
    converter({})
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
    }))
  }, TypeError, 'invalid generator')
})

describe('webidl.dictionaryConverter', () => {
  test('arguments', () => {
    const converter = webidl.dictionaryConverter([])

    assert.throws(() => {
      converter(true)
    }, TypeError)

    for (const value of [{}, undefined, null]) {
      assert.doesNotThrow(() => {
        converter(value)
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
      converter({ wrongKey: 'key' })
    }, TypeError)

    assert.doesNotThrow(() => {
      converter({ Key: 'this key was required!' })
    })
  })
})

test('ArrayBuffer', () => {
  assert.throws(() => {
    webidl.converters.ArrayBuffer(true)
  }, TypeError)

  assert.throws(() => {
    webidl.converters.ArrayBuffer({})
  }, TypeError)

  assert.throws(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab, { allowShared: false })
  }, TypeError)

  assert.doesNotThrow(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab)
  })

  assert.doesNotThrow(() => {
    const ab = new ArrayBuffer(8)
    webidl.converters.ArrayBuffer(ab)
  })
})

test('TypedArray', () => {
  assert.throws(() => {
    webidl.converters.TypedArray(3)
  }, TypeError)

  assert.throws(() => {
    webidl.converters.TypedArray({})
  }, TypeError)

  assert.throws(() => {
    const uint8 = new Uint8Array([1, 2, 3])
    Object.defineProperty(uint8, 'buffer', {
      get () {
        return new SharedArrayBuffer(8)
      }
    })

    webidl.converters.TypedArray(uint8, Uint8Array, {
      allowShared: false
    })
  }, TypeError)
})

test('DataView', () => {
  assert.throws(() => {
    webidl.converters.DataView(3)
  }, TypeError)

  assert.throws(() => {
    webidl.converters.DataView({})
  }, TypeError)

  assert.throws(() => {
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer, 0)

    Object.defineProperty(view, 'buffer', {
      get () {
        return new SharedArrayBuffer(8)
      }
    })

    webidl.converters.DataView(view, {
      allowShared: false
    })
  })

  const buffer = new ArrayBuffer(16)
  const view = new DataView(buffer, 0)

  assert.equal(webidl.converters.DataView(view), view)
})

test('BufferSource', () => {
  assert.doesNotThrow(() => {
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer, 0)

    webidl.converters.BufferSource(view)
  })

  assert.throws(() => {
    webidl.converters.BufferSource(3)
  }, TypeError)
})

test('ByteString', () => {
  assert.doesNotThrow(() => {
    webidl.converters.ByteString('')
  })

  // https://github.com/nodejs/undici/issues/1590
  assert.throws(() => {
    const char = String.fromCharCode(256)
    webidl.converters.ByteString(`invalid${char}char`)
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
