'use strict'

const { describe, test } = require('node:test')
const assert = require('node:assert')
const { webidl } = require('../../lib/web/webidl')

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

describe('buffer source converters', () => {
  test('ArrayBuffer', () => {
    assert.throws(() => {
      webidl.converters.ArrayBuffer(true, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.ArrayBuffer({}, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.ArrayBuffer(new ArrayBuffer(8), 'converter', 'converter')
    })

    assert.throws(() => {
      webidl.converters.ArrayBuffer(new SharedArrayBuffer(64), 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.ArrayBuffer(
        new ArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter'
      )
    })

    assert.doesNotThrow(() => {
      webidl.converters.ArrayBuffer(
        new ArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter',
        { allowResizable: true }
      )
    })
  })

  test('SharedArrayBuffer', () => {
    assert.throws(() => {
      webidl.converters.SharedArrayBuffer(true, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.SharedArrayBuffer({}, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.SharedArrayBuffer(new SharedArrayBuffer(8), 'converter', 'converter')
    })

    assert.throws(() => {
      webidl.converters.SharedArrayBuffer(new ArrayBuffer(64), 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.SharedArrayBuffer(
        new SharedArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter'
      )
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.SharedArrayBuffer(
        new SharedArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter',
        { allowResizable: true }
      )
    })
  })

  test('TypedArray', () => {
    assert.throws(() => {
      webidl.converters.TypedArray(3, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.TypedArray({}, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.TypedArray(new Uint8Array(), Uint8Array, 'converter', 'converter')
    })

    assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16)),
        Uint8Array,
        'converter',
        'converter'
      )
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16)),
        Uint8Array,
        'converter',
        'converter',
        { allowShared: true }
      )
    })

    assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new ArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter'
      )
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new ArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        { allowResizable: true }
      )
    })

    assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        { allowResizable: true }
      )
    }, TypeError)

    assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        { allowShared: true }
      )
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        { allowResizable: true, allowShared: true }
      )
    })
  })

  test('DataView', () => {
    assert.throws(() => {
      webidl.converters.DataView(3, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.DataView({}, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.DataView(new Uint8Array(), 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.DataView(new DataView(new ArrayBuffer(8)), 'converter', 'converter')
    })

    assert.throws(() => {
      webidl.converters.DataView(
        new DataView(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)

    assert.throws(() => {
      webidl.converters.DataView(
        new DataView(new ArrayBuffer(16, { maxByteLength: 64 })),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('ArrayBufferView', () => {
    assert.throws(() => {
      webidl.converters.ArrayBufferView(3, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.ArrayBufferView({}, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.ArrayBufferView(new Uint8Array(), 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.ArrayBufferView(new DataView(new ArrayBuffer(8)), 'converter', 'converter')
    })

    assert.throws(() => {
      webidl.converters.ArrayBufferView(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)

    assert.throws(() => {
      webidl.converters.ArrayBufferView(
        new Float32Array(new ArrayBuffer(16, { maxByteLength: 64 })),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('BufferSource', () => {
    assert.throws(() => {
      webidl.converters.BufferSource(3, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.BufferSource({}, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.BufferSource(new SharedArrayBuffer(16), 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.BufferSource(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('AllowSharedBufferSource', () => {
    assert.throws(() => {
      webidl.converters.AllowSharedBufferSource(3, 'converter', 'converter')
    }, TypeError)

    assert.throws(() => {
      webidl.converters.AllowSharedBufferSource({}, 'converter', 'converter')
    }, TypeError)

    assert.doesNotThrow(() => {
      webidl.converters.AllowSharedBufferSource(new SharedArrayBuffer(16), 'converter', 'converter')
    })

    assert.doesNotThrow(() => {
      webidl.converters.AllowSharedBufferSource(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    })
  })
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

test('recordConverter', () => {
  const anyConverter = webidl.recordConverter(webidl.converters.any, webidl.converters.any)

  assert.throws(
    () => anyConverter(null, 'prefix', 'argument'),
    new TypeError('prefix: argument ("Null") is not an Object.')
  )
})

test('webidl.converters.boolean', () => {
  assert.strictEqual(webidl.converters.boolean(null), false)
  assert.strictEqual(webidl.converters.boolean(undefined), false)

  assert.strictEqual(webidl.converters.boolean(true), true)
  assert.strictEqual(webidl.converters.boolean(false), false)

  assert.strictEqual(webidl.converters.boolean(''), false)
  assert.strictEqual(webidl.converters.boolean('true'), true)
  assert.strictEqual(webidl.converters.boolean('false'), true)

  assert.strictEqual(webidl.converters.boolean(1), true)
  assert.strictEqual(webidl.converters.boolean(0), false)
  assert.strictEqual(webidl.converters.boolean(-0), false)
  assert.strictEqual(webidl.converters.boolean(NaN), false)
  assert.strictEqual(webidl.converters.boolean(Infinity), true)
  assert.strictEqual(webidl.converters.boolean(-Infinity), true)

  assert.strictEqual(webidl.converters.boolean(0n), false)
  assert.strictEqual(webidl.converters.boolean(1n), true)

  assert.strictEqual(webidl.converters.boolean({}), true)
  assert.strictEqual(webidl.converters.boolean([]), true)
  assert.strictEqual(webidl.converters.boolean(() => {}), true)
  assert.strictEqual(webidl.converters.boolean(/a/), true)
  assert.strictEqual(webidl.converters.boolean(new Date()), true)
  assert.strictEqual(webidl.converters.boolean(new Map()), true)
  assert.strictEqual(webidl.converters.boolean(new Set()), true)
  assert.strictEqual(webidl.converters.boolean(new Date()), true)
})
