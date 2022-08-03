'use strict'

const { types } = require('util')
const { hasOwn, toUSVString } = require('./util')

const webidl = {}
webidl.converters = {}
webidl.util = {}
webidl.errors = {}

/**
 *
 * @param {{
 *   header: string
 *   message: string
 * }} message
 */
webidl.errors.exception = function (message) {
  throw new TypeError(`${message.header}: ${message.message}`)
}

/**
 * Throw an error when conversion from one type to another has failed
 * @param {{
 *   prefix: string
 *   argument: string
 *   types: string[]
 * }} context
 */
webidl.errors.conversionFailed = function (context) {
  const plural = context.types.length === 1 ? '' : ' one of'
  const message =
    `${context.argument} could not be converted to` +
    `${plural}: ${context.types.join(', ')}.`

  return webidl.errors.exception({
    header: context.prefix,
    message
  })
}

/**
 * Throw an error when an invalid argument is provided
 * @param {{
 *   prefix: string
 *   value: string
 *   type: string
 * }} context
 */
webidl.errors.invalidArgument = function (context) {
  return webidl.errors.exception({
    header: context.prefix,
    message: `"${context.value}" is an invalid ${context.type}.`
  })
}

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
      webidl.errors.exception({
        header: 'Integer conversion',
        message: `Could not convert ${V} to an integer.`
      })
    }

    // 2. Set x to IntegerPart(x).
    x = webidl.util.IntegerPart(x)

    // 3. If x < lowerBound or x > upperBound, then
    //    throw a TypeError.
    if (x < lowerBound || x > upperBound) {
      webidl.errors.exception({
        header: 'Integer conversion',
        message: `Value must be between ${lowerBound}-${upperBound}, got ${x}.`
      })
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

// https://webidl.spec.whatwg.org/#es-sequence
webidl.sequenceConverter = function (converter) {
  return (V) => {
    // 1. If Type(V) is not Object, throw a TypeError.
    if (webidl.util.Type(V) !== 'Object') {
      webidl.errors.exception({
        header: 'Sequence',
        message: `Value of type ${webidl.util.Type(V)} is not an Object.`
      })
    }

    // 2. Let method be ? GetMethod(V, @@iterator).
    /** @type {Generator} */
    const method = V?.[Symbol.iterator]?.()
    const seq = []

    // 3. If method is undefined, throw a TypeError.
    if (
      method === undefined ||
      typeof method.next !== 'function'
    ) {
      webidl.errors.exception({
        header: 'Sequence',
        message: 'Object is not an iterator.'
      })
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
}

webidl.recordConverter = function (keyConverter, valueConverter) {
  return (V) => {
    const record = {}
    const type = webidl.util.Type(V)

    if (type === 'Undefined' || type === 'Null') {
      return record
    }

    if (type !== 'Object') {
      webidl.errors.exception({
        header: 'Record',
        message: `Expected ${V} to be an Object type.`
      })
    }

    for (let [key, value] of Object.entries(V)) {
      key = keyConverter(key)
      value = valueConverter(value)

      record[key] = value
    }

    return record
  }
}

webidl.interfaceConverter = function (i) {
  return (V, opts = {}) => {
    if (opts.strict !== false && !(V instanceof i)) {
      webidl.errors.exception({
        header: i.name,
        message: `Expected ${V} to be an instance of ${i.name}.`
      })
    }

    return V
  }
}

/**
 * @param {{
 *   key: string,
 *   defaultValue?: any,
 *   required?: boolean,
 *   converter: (...args: unknown[]) => unknown,
 *   allowedValues?: any[]
 * }[]} converters
 * @returns
 */
webidl.dictionaryConverter = function (converters) {
  return (dictionary) => {
    const type = webidl.util.Type(dictionary)
    const dict = {}

    if (type !== 'Null' && type !== 'Undefined' && type !== 'Object') {
      webidl.errors.exception({
        header: 'Dictionary',
        message: `Expected ${dictionary} to be one of: Null, Undefined, Object.`
      })
    }

    for (const options of converters) {
      const { key, defaultValue, required, converter } = options

      if (required === true) {
        if (!hasOwn(dictionary, key)) {
          webidl.errors.exception({
            header: 'Dictionary',
            message: `Missing required key "${key}".`
          })
        }
      }

      let value = dictionary[key]
      const hasDefault = hasOwn(options, 'defaultValue')

      // Only use defaultValue if value is undefined and
      // a defaultValue options was provided.
      if (hasDefault && value !== null) {
        value = value ?? defaultValue
      }

      // A key can be optional and have no default value.
      // When this happens, do not perform a conversion,
      // and do not assign the key a value.
      if (required || hasDefault || value !== undefined) {
        value = converter(value)

        if (
          options.allowedValues &&
          !options.allowedValues.includes(value)
        ) {
          webidl.errors.exception({
            header: 'Dictionary',
            message: `${value} is not an accepted type. Expected one of ${options.allowedValues.join(', ')}.`
          })
        }

        dict[key] = value
      }
    }

    return dict
  }
}

webidl.nullableConverter = function (converter) {
  return (V) => {
    if (V === null) {
      return V
    }

    return converter(V)
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

// https://webidl.spec.whatwg.org/#es-ByteString
webidl.converters.ByteString = function (V) {
  // 1. Let x be ? ToString(V).
  // Note: DOMString converter perform ? ToString(V)
  const x = webidl.converters.DOMString(V)

  // 2. If the value of any element of x is greater than
  //    255, then throw a TypeError.
  for (let index = 0; index < x.length; index++) {
    const charCode = x.charCodeAt(index)

    if (charCode > 255) {
      throw new TypeError(
        'Cannot convert argument to a ByteString because the character at' +
        `index ${index} has a value of ${charCode} which is greater than 255.`
      )
    }
  }

  // 3. Return an IDL ByteString value whose length is the
  //    length of x, and where the value of each element is
  //    the value of the corresponding element of x.
  return x
}

// https://webidl.spec.whatwg.org/#es-USVString
// TODO: ensure that util.toUSVString follows webidl spec
webidl.converters.USVString = toUSVString

// https://webidl.spec.whatwg.org/#es-boolean
webidl.converters.boolean = function (V) {
  // 1. Let x be the result of computing ToBoolean(V).
  const x = Boolean(V)

  // 2. Return the IDL boolean value that is the one that represents
  //    the same truth value as the ECMAScript Boolean value x.
  return x
}

// https://webidl.spec.whatwg.org/#es-any
webidl.converters.any = function (V) {
  return V
}

// https://webidl.spec.whatwg.org/#es-long-long
webidl.converters['long long'] = function (V, opts) {
  // 1. Let x be ? ConvertToInt(V, 64, "signed").
  const x = webidl.util.ConvertToInt(V, 64, 'signed', opts)

  // 2. Return the IDL long long value that represents
  //    the same numeric value as x.
  return x
}

// https://webidl.spec.whatwg.org/#es-unsigned-short
webidl.converters['unsigned short'] = function (V) {
  // 1. Let x be ? ConvertToInt(V, 16, "unsigned").
  const x = webidl.util.ConvertToInt(V, 16, 'unsigned')

  // 2. Return the IDL unsigned short value that represents
  //    the same numeric value as x.
  return x
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
    webidl.errors.conversionFailed({
      prefix: `${V}`,
      argument: `${V}`,
      types: ['ArrayBuffer']
    })
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V) is true, then throw a
  //    TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V)) {
    webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
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
    webidl.errors.conversionFailed({
      prefix: `${T.name}`,
      argument: `${V}`,
      types: [T.name]
    })
  }

  // 3. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is
  //    true, then throw a TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
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
    webidl.errors.exception({
      header: 'DataView',
      message: 'Object is not a DataView.'
    })
  }

  // 2. If the conversion is not to an IDL type associated
  //    with the [AllowShared] extended attribute, and
  //    IsSharedArrayBuffer(V.[[ViewedArrayBuffer]]) is true,
  //    then throw a TypeError.
  if (opts.allowShared === false && types.isSharedArrayBuffer(V.buffer)) {
    webidl.errors.exception({
      header: 'ArrayBuffer',
      message: 'SharedArrayBuffer is not allowed.'
    })
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

webidl.converters['sequence<ByteString>'] = webidl.sequenceConverter(
  webidl.converters.ByteString
)

webidl.converters['sequence<sequence<ByteString>>'] = webidl.sequenceConverter(
  webidl.converters['sequence<ByteString>']
)

webidl.converters['record<ByteString, ByteString>'] = webidl.recordConverter(
  webidl.converters.ByteString,
  webidl.converters.ByteString
)

module.exports = {
  webidl
}
