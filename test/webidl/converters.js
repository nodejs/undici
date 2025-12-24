'use strict'

const { describe, test } = require('node:test')
const { webidl } = require('../../lib/web/webidl')

test('sequence', (t) => {
  const converter = webidl.sequenceConverter(
    webidl.converters.DOMString
  )

  t.assert.deepStrictEqual(converter([1, 2, 3]), ['1', '2', '3'])

  t.assert.throws(() => {
    converter(3, 'converter', 'converter')
  }, TypeError, 'disallows non-objects')

  t.assert.throws(() => {
    converter(null, 'converter', 'converter')
  }, TypeError)

  t.assert.throws(() => {
    converter(undefined, 'converter', 'converter')
  }, TypeError)

  t.assert.throws(() => {
    converter({}, 'converter', 'converter')
  }, TypeError, 'no Symbol.iterator')

  t.assert.throws(() => {
    converter({
      [Symbol.iterator]: 42
    })
  }, TypeError, 'invalid Symbol.iterator')

  t.assert.throws(() => {
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
  test('arguments', (t) => {
    const converter = webidl.dictionaryConverter([])

    t.assert.throws(() => {
      converter(true, 'converter', 'converter')
    }, TypeError)

    for (const value of [{}, undefined, null]) {
      t.assert.doesNotThrow(() => {
        converter(value, 'converter', 'converter')
      })
    }
  })

  test('required key', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        converter: () => true,
        key: 'Key',
        required: true
      }
    ])

    t.assert.throws(() => {
      converter({ wrongKey: 'key' }, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      converter({ Key: 'this key was required!' }, 'converter', 'converter')
    })
  })

  test('null and undefined still populates defaultValue(s)', (t) => {
    const dict = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.any,
        defaultValue: () => 3
      }
    ])

    t.assert.deepStrictEqual(dict(null), { key: 3 })
    t.assert.deepStrictEqual(dict(undefined), { key: 3 })
  })

  test('null and undefined throw a webidl TypeError with a required key', (t) => {
    const dict = webidl.dictionaryConverter([
      {
        key: 'key',
        converter: webidl.converters.any,
        required: true
      }
    ])

    t.assert.throws(() => dict(null, 'prefix'), new TypeError('prefix: Missing required key "key".'))
    t.assert.throws(() => dict(undefined, 'prefix'), new TypeError('prefix: Missing required key "key".'))
  })

  test('Object type works for functions and regex (etc.)', (t) => {
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

    t.assert.deepStrictEqual(dict(obj), { key: 1 })
    t.assert.deepStrictEqual(dict(obj2), { key: 1 })
  })
})

describe('buffer source converters', () => {
  test('ArrayBuffer', (t) => {
    t.assert.throws(() => {
      webidl.converters.ArrayBuffer(true, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.ArrayBuffer({}, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.ArrayBuffer(new ArrayBuffer(8), 'converter', 'converter')
    })

    t.assert.throws(() => {
      webidl.converters.ArrayBuffer(new SharedArrayBuffer(64), 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.ArrayBuffer(
        new ArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter'
      )
    })

    t.assert.doesNotThrow(() => {
      webidl.converters.ArrayBuffer(
        new ArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter',
        webidl.attributes.AllowResizable
      )
    })
  })

  test('SharedArrayBuffer', (t) => {
    t.assert.throws(() => {
      webidl.converters.SharedArrayBuffer(true, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.SharedArrayBuffer({}, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.SharedArrayBuffer(new SharedArrayBuffer(8), 'converter', 'converter')
    })

    t.assert.throws(() => {
      webidl.converters.SharedArrayBuffer(new ArrayBuffer(64), 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.SharedArrayBuffer(
        new SharedArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter'
      )
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.SharedArrayBuffer(
        new SharedArrayBuffer(16, { maxByteLength: 64 }),
        'converter',
        'converter',
        webidl.attributes.AllowResizable
      )
    })
  })

  test('TypedArray', (t) => {
    t.assert.throws(() => {
      webidl.converters.TypedArray(3, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.TypedArray({}, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.TypedArray(new Uint8Array(), Uint8Array, 'converter', 'converter')
    })

    t.assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16)),
        Uint8Array,
        'converter',
        'converter'
      )
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16)),
        Uint8Array,
        'converter',
        'converter',
        webidl.attributes.AllowShared
      )
    })

    t.assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new ArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter'
      )
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new ArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        webidl.attributes.AllowResizable
      )
    })

    t.assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        webidl.attributes.AllowResizable
      )
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        webidl.attributes.AllowShared
      )
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.TypedArray(
        new Uint8Array(new SharedArrayBuffer(16, { maxByteLength: 32 })),
        Uint8Array,
        'converter',
        'converter',
        webidl.attributes.AllowResizable | webidl.attributes.AllowShared
      )
    })
  })

  test('DataView', (t) => {
    t.assert.throws(() => {
      webidl.converters.DataView(3, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.DataView({}, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.DataView(new Uint8Array(), 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.DataView(new DataView(new ArrayBuffer(8)), 'converter', 'converter')
    })

    t.assert.throws(() => {
      webidl.converters.DataView(
        new DataView(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.DataView(
        new DataView(new ArrayBuffer(16, { maxByteLength: 64 })),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('ArrayBufferView', (t) => {
    t.assert.throws(() => {
      webidl.converters.ArrayBufferView(3, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.ArrayBufferView({}, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.ArrayBufferView(new Uint8Array(), 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.ArrayBufferView(new DataView(new ArrayBuffer(8)), 'converter', 'converter')
    })

    t.assert.throws(() => {
      webidl.converters.ArrayBufferView(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.ArrayBufferView(
        new Float32Array(new ArrayBuffer(16, { maxByteLength: 64 })),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('BufferSource', (t) => {
    t.assert.throws(() => {
      webidl.converters.BufferSource(3, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.BufferSource({}, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.BufferSource(new SharedArrayBuffer(16), 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.BufferSource(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    }, TypeError)
  })

  test('AllowSharedBufferSource', (t) => {
    t.assert.throws(() => {
      webidl.converters.AllowSharedBufferSource(3, 'converter', 'converter')
    }, TypeError)

    t.assert.throws(() => {
      webidl.converters.AllowSharedBufferSource({}, 'converter', 'converter')
    }, TypeError)

    t.assert.doesNotThrow(() => {
      webidl.converters.AllowSharedBufferSource(new SharedArrayBuffer(16), 'converter', 'converter')
    })

    t.assert.doesNotThrow(() => {
      webidl.converters.AllowSharedBufferSource(
        new Uint8Array(new SharedArrayBuffer(16)),
        'converter',
        'converter'
      )
    })
  })
})

test('ByteString', (t) => {
  t.assert.doesNotThrow(() => {
    webidl.converters.ByteString('', 'converter', 'converter')
  })

  // https://github.com/nodejs/undici/issues/1590
  t.assert.throws(() => {
    const char = String.fromCharCode(256)
    webidl.converters.ByteString(`invalid${char}char`, 'converter', 'converter')
  }, {
    message: 'Cannot convert argument to a ByteString because the character at ' +
             'index 7 has a value of 256 which is greater than 255.'
  })
})

test('recordConverter', (t) => {
  const anyConverter = webidl.recordConverter(webidl.converters.any, webidl.converters.any)

  t.assert.throws(
    () => anyConverter(null, 'prefix', 'argument'),
    new TypeError('prefix: argument ("Null") is not an Object.')
  )
})

test('webidl.converters.boolean', (t) => {
  t.assert.strictEqual(webidl.converters.boolean(null), false)
  t.assert.strictEqual(webidl.converters.boolean(undefined), false)

  t.assert.strictEqual(webidl.converters.boolean(true), true)
  t.assert.strictEqual(webidl.converters.boolean(false), false)

  t.assert.strictEqual(webidl.converters.boolean(''), false)
  t.assert.strictEqual(webidl.converters.boolean('true'), true)
  t.assert.strictEqual(webidl.converters.boolean('false'), true)

  t.assert.strictEqual(webidl.converters.boolean(1), true)
  t.assert.strictEqual(webidl.converters.boolean(0), false)
  t.assert.strictEqual(webidl.converters.boolean(-0), false)
  t.assert.strictEqual(webidl.converters.boolean(NaN), false)
  t.assert.strictEqual(webidl.converters.boolean(Infinity), true)
  t.assert.strictEqual(webidl.converters.boolean(-Infinity), true)

  t.assert.strictEqual(webidl.converters.boolean(0n), false)
  t.assert.strictEqual(webidl.converters.boolean(1n), true)

  t.assert.strictEqual(webidl.converters.boolean({}), true)
  t.assert.strictEqual(webidl.converters.boolean([]), true)
  t.assert.strictEqual(webidl.converters.boolean(() => {}), true)
  t.assert.strictEqual(webidl.converters.boolean(/a/), true)
  t.assert.strictEqual(webidl.converters.boolean(new Date()), true)
  t.assert.strictEqual(webidl.converters.boolean(new Map()), true)
  t.assert.strictEqual(webidl.converters.boolean(new Set()), true)
  t.assert.strictEqual(webidl.converters.boolean(new Date()), true)
})
