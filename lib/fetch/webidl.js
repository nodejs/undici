'use strict'

const { toUSVString, types } = require('util')

const webidl = {}
webidl.converters = {}
webidl.util = {}

// https://tc39.es/ecma262/#sec-ecmascript-data-types-and-values
webidl.util.Type = function (V) {
  switch (typeof V) {
    case 'undefined': return 'Undefined'
    case 'boolean': return 'Boolean'
    case 'string': return 'String'
    case 'symbol': return 'Symbol'
    case 'number': return 'Number'
    case 'bigint': return 'BigInt'
    case 'function':
    case 'object': {
      if (V === null) {
        return 'Null'
      }

      return 'Object'
    }
  }
}

// https://webidl.spec.whatwg.org/#abstract-opdef-converttoint
webidl.util.ConvertToInt = function (V, bitLength, signedness, opts = {}) {
  let upperBound
  let lowerBound

  // 1. If bitLength is 64, then:
  if (bitLength === 64) {
    // 1. Let upperBound be 2^53 − 1.
    upperBound = Math.pow(2, 53) - 1

    // 2. If signedness is "unsigned", then let lowerBound be 0.
    if (signedness === 'unsigned') {
      lowerBound = 0
    } else {
      // 3. Otherwise let lowerBound be −2^53 + 1.
      lowerBound = Math.pow(-2, 53) + 1
    }
  } else if (signedness === 'unsigned') {
    // 2. Otherwise, if signedness is "unsigned", then:

    // 1. Let lowerBound be 0.
    lowerBound = 0

    // 2. Let upperBound be 2^bitLength − 1.
    upperBound = Math.pow(2, bitLength) - 1
  } else {
    // 3. Otherwise:

    // 1. Let lowerBound be -2^bitLength − 1.
    lowerBound = Math.pow(-2, bitLength) - 1

    // 2. Let upperBound be 2^bitLength − 1 − 1.
    upperBound = Math.pow(2, bitLength - 1) - 1
  }

  // 4. Let x be ? ToNumber(V).
  let x = Number(V)

  // 5. If x is −0, then set x to +0.
  if (Object.is(-0, x)) {
    x = 0
  }

  // 6. If the conversion is to an IDL type associated
  //    with the [EnforceRange] extended attribute, then:
  if (opts.enforceRange === true) {
    // 1. If x is NaN, +∞, or −∞, then throw a TypeError.
    if (
      Number.isNaN(x) ||
      x === Number.POSITIVE_INFINITY ||
      x === Number.NEGATIVE_INFINITY
    ) {
      throw new TypeError()
    }

    // 2. Set x to IntegerPart(x).
    x = webidl.util.IntegerPart(x)

    // 3. If x < lowerBound or x > upperBound, then
    //    throw a TypeError.
    if (x < lowerBound || x > upperBound) {
      throw new TypeError()
    }

    // 4. Return x.
    return x
  }

  // 7. If x is not NaN and the conversion is to an IDL
  //    type associated with the [Clamp] extended
  //    attribute, then:
  if (!Number.isNaN(x) && opts.clamp === true) {
    // 1. Set x to min(max(x, lowerBound), upperBound).
    x = Math.min(Math.max(x, lowerBound), upperBound)

    // 2. Round x to the nearest integer, choosing the
    //    even integer if it lies halfway between two,
    //    and choosing +0 rather than −0.
    if (Math.floor(x) % 2 === 0) {
      x = Math.floor(x)
    } else {
      x = Math.ceil(x)
    }

    // 3. Return x.
    return x
  }

  // 8. If x is NaN, +0, +∞, or −∞, then return +0.
  if (
    Number.isNaN(x) ||
    Object.is(0, x) ||
    x === Number.POSITIVE_INFINITY ||
    x === Number.NEGATIVE_INFINITY
  ) {
    return 0
  }

  // 9. Set x to IntegerPart(x).
  x = webidl.util.IntegerPart(x)

  // 10. Set x to x modulo 2^bitLength.
  x = x % Math.pow(2, bitLength)

  // 11. If signedness is "signed" and x ≥ 2^bitLength − 1,
  //    then return x − 2^bitLength.
  if (signedness === 'signed' && x >= Math.pow(2, bitLength) - 1) {
    return x - Math.pow(2, bitLength)
  }

  // 12. Otherwise, return x.
  return x
}

// https://webidl.spec.whatwg.org/#abstract-opdef-integerpart
webidl.util.IntegerPart = function (n) {
  // 1. Let r be floor(abs(n)).
  const r = Math.floor(Math.abs(n))

  // 2. If n < 0, then return -1 × r.
  if (n < 0) {
    return -1 * r
  }

  // 3. Otherwise, return r.
  return r
}

webidl.sequenceConverter = function (converter) {
  return (V) => {
    return webidl.converters.sequence(V, converter)
  }
}

webidl.interfaceConverter = function (i) {
  return (V) => {
    if (!(V instanceof i)) {
      throw new TypeError()
    }

    return V
  }
}

/**
 * @param {{
 *   key: string,
 *   defaultValue?: any,
 *   required?: boolean,
 *   converter: (...args: unknown[]) => unknown
 * }[]} converters
 * @returns
 */
webidl.dictionaryConverter = function (converters) {
  return (dictionary) => {
    const type = webidl.util.Type(dictionary)
    const dict = {}

    if (type !== 'Null' && type !== 'Undefined' && type !== 'Object') {
      throw new TypeError()
    }

    for (const options of converters) {
      const { key, defaultValue, required, converter } = options

      if (required === true) {
        if (!Object.hasOwn(dictionary, key)) {
          throw new TypeError()
        }
      }

      let value = dictionary[key]

      // only use defaultValue if it is provided,
      // even if it's falsy
      if (Object.hasOwn(options, 'defaultValue')) {
        value = value ?? defaultValue
      }

      value = converter(value)

      dict[key] = value
    }

    return dict
  }
}

// https://webidl.spec.whatwg.org/#es-DOMString
webidl.converters.DOMString = function (V, opts = {}) {
  // 1. If V is null and the conversion is to an IDL type
  //    associated with the [LegacyNullToEmptyString]
  //    extended attribute, then return the DOMString value
  //    that represents the empty string.
  if (V === null && opts.legacyNullToEmptyString) {
    return ''
  }

  // 2. Let x be ? ToString(V).
  if (typeof V === 'symbol') {
    throw new TypeError('Could not convert argument of type symbol to string.')
  }

  // 3. Return the IDL DOMString value that represents the
  //    same sequence of code units as the one the
  //    ECMAScript String value x represents.
  return String(V)
}

// eslint-disable-next-line no-control-regex
const isNotLatin1 = /[^\u0000-\u00ff]/

// https://webidl.spec.whatwg.org/#es-ByteString
webidl.converters.ByteString = function (V) {
  // 1. Let x be ? ToString(V).
  // Note: DOMString converter perform ? ToString(V)
  const x = webidl.converters.DOMString(V)

  // 2. If the value of any element of x is greater than
  //    255, then throw a TypeError.
  if (isNotLatin1.test(x)) {
    throw new TypeError('Argument is not a ByteString')
  }

  // 3. Return an IDL ByteString value whose length is the
  //    length of x, and where the value of each element is
  //    the value of the corresponding element of x.
  return x
}

// https://webidl.spec.whatwg.org/#es-USVString
// TODO: ensure that util.toUSVString follows webidl spec
webidl.converters.USVString = toUSVString

// https://webidl.spec.whatwg.org/#es-long-long
webidl.converters['long long'] = function (V, opts) {
  // 1. Let x be ? ConvertToInt(V, 64, "signed").
  const x = webidl.util.ConvertToInt(V, 64, 'signed', opts)

  // 2. Return the IDL long long value that represents
  //    the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#es-sequence
webidl.converters.sequence = function (V, converter) {
  // 1. If Type(V) is not Object, throw a TypeError.
  if (webidl.util.Type(V) !== 'Object') {
    throw new TypeError()
  }

  // 2. Let method be ? GetMethod(V, @@iterator).
  /** @type {Generator} */
  const method = V[Symbol.iterator]?.()
  const seq = []

  // 3. If method is undefined, throw a TypeError.
  if (
    method === undefined ||
    typeof method.next !== 'function'
  ) {
    throw new TypeError()
  }

  // https://webidl.spec.whatwg.org/#create-sequence-from-iterable
  while (true) {
    const { done, value } = method.next()

    if (done) {
      break
    }

    seq.push(converter(value))
  }

  return seq
}

// https://webidl.spec.whatwg.org/#idl-ArrayBuffer
webidl.converters.ArrayBuffer = function (V, opts = {}) {
  // 1. If Type(V) is not Object, or V does not have an
  //    [[ArrayBufferData]] internal slot, then throw a
  //    TypeError.
  // see: https://tc39.es/ecma262/#sec-properties-of-the-arraybuffer-instances
  // see: https://tc39.es/ecma262/#sec-properties-of-the-sharedarraybuffer-instances
  if (
    webidl.util.Type(V) !== 'Object' ||
    !types.isAnyArrayBuffer(V)
  ) {
    throw new TypeError()
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V) is true, then throw a
  //    TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V)) {
    throw new TypeError()
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V) is true, then throw a
  //    TypeError.
  // Note: resizable ArrayBuffers are currently a proposal.

  // 4. Return the IDL ArrayBuffer value that is a
  //    reference to the same object as V.
  return V
}

webidl.converters.TypedArray = function (V, T, opts = {}) {
  // 1. Let T be the IDL type V is being converted to.

  // 2. If Type(V) is not Object, or V does not have a
  //    [[TypedArrayName]] internal slot with a value
  //    equal to T’s name, then throw a TypeError.
  if (
    webidl.util.Type(V) !== 'Object' ||
    !types.isTypedArray(V) ||
    V.constructor.name !== T.name
  ) {
    throw new TypeError()
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    throw new TypeError()
  }

  // 4. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  // Note: resizable array buffers are currently a proposal

  // 5. Return the IDL value of type T that is a reference
  //    to the same object as V.
  return V
}

webidl.converters.DataView = function (V, opts = {}) {
  // 1. If Type(V) is not Object, or V does not have a
  //    [[DataView]] internal slot, then throw a TypeError.
  if (webidl.util.Type(V) !== 'Object' || !types.isDataView(V)) {
    throw new TypeError()
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is true,
  //    then throw a TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    throw new TypeError()
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowResizable] extended attribute, and
  //    IsResizableArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  // Note: resizable ArrayBuffers are currently a proposal

  // 4. Return the IDL DataView value that is a reference
  //    to the same object as V.
  return V
}

// https://webidl.spec.whatwg.org/#BufferSource
webidl.converters.BufferSource = function (V, opts = {}) {
  if (types.isAnyArrayBuffer(V)) {
    return webidl.converters.ArrayBuffer(V, opts)
  }

  if (types.isTypedArray(V)) {
    return webidl.converters.TypedArray(V, V.constructor)
  }

  if (types.isDataView(V)) {
    return webidl.converters.DataView(V, opts)
  }

  throw new TypeError(`Could not convert ${V} to a BufferSource.`)
}

module.exports = {
  webidl
}
