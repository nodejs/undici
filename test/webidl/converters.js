'use strict'

const { test } = require('tap')
const { webidl } = require('../../lib/fetch/webidl')

test('sequence', (t) => {
  const converter = webidl.sequenceConverter(
    webidl.converters.DOMString
  )

  t.same(converter([1, 2, 3]), ['1', '2', '3'])

  t.throws(() => {
    converter(3)
  }, TypeError, 'disallows non-objects')

  t.throws(() => {
    converter(null)
  }, TypeError)

  t.throws(() => {
    converter(undefined)
  }, TypeError)

  t.throws(() => {
    converter({})
  }, TypeError, 'no Symbol.iterator')

  t.throws(() => {
    converter({
      [Symbol.iterator]: 42
    })
  }, TypeError, 'invalid Symbol.iterator')

  t.throws(() => {
    converter(webidl.converters.sequence({
      [Symbol.iterator] () {
        return {
          next: 'never!'
        }
      }
    }))
  }, TypeError, 'invalid generator')

  t.end()
})

test('webidl.dictionaryConverter', (t) => {
  t.test('arguments', (t) => {
    const converter = webidl.dictionaryConverter([])

    t.throws(() => {
      converter(true)
    }, TypeError)

    for (const value of [{}, undefined, null]) {
      t.doesNotThrow(() => {
        converter(value)
      })
    }

    t.end()
  })

  t.test('required key', (t) => {
    const converter = webidl.dictionaryConverter([
      {
        converter: () => true,
        key: 'Key',
        required: true
      }
    ])

    t.throws(() => {
      converter({ wrongKey: 'key' })
    }, TypeError)

    t.doesNotThrow(() => {
      converter({ Key: 'this key was required!' })
    })

    t.end()
  })

  t.end()
})

test('ArrayBuffer', (t) => {
  t.throws(() => {
    webidl.converters.ArrayBuffer(true)
  }, TypeError)

  t.throws(() => {
    webidl.converters.ArrayBuffer({})
  }, TypeError)

  t.throws(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab, { allowShared: false })
  }, TypeError)

  t.doesNotThrow(() => {
    const sab = new SharedArrayBuffer(1024)
    webidl.converters.ArrayBuffer(sab)
  })

  t.doesNotThrow(() => {
    const ab = new ArrayBuffer(8)
    webidl.converters.ArrayBuffer(ab)
  })

  t.end()
})

test('TypedArray', (t) => {
  t.throws(() => {
    webidl.converters.TypedArray(3)
  }, TypeError)

  t.throws(() => {
    webidl.converters.TypedArray({})
  }, TypeError)

  t.throws(() => {
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

  t.end()
})

test('DataView', (t) => {
  t.throws(() => {
    webidl.converters.DataView(3)
  }, TypeError)

  t.throws(() => {
    webidl.converters.DataView({})
  }, TypeError)

  t.throws(() => {
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

  t.equal(webidl.converters.DataView(view), view)

  t.end()
})

test('BufferSource', (t) => {
  t.doesNotThrow(() => {
    const buffer = new ArrayBuffer(16)
    const view = new DataView(buffer, 0)

    webidl.converters.BufferSource(view)
  })

  t.throws(() => {
    webidl.converters.BufferSource(3)
  }, TypeError)

  t.end()
})
