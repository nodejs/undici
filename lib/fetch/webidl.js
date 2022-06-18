'use strict'

const { toUSVString } = require('util')

const webidl = {}
webidl.converters = {}

// https://webidl.spec.whatwg.org/#es-DOMString
webidl.converters.DOMString = function DOMString (V, opts = {}) {
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
webidl.converters.ByteString = function ByteString (V) {
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

module.exports = {
  webidl
}
