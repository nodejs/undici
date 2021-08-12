// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { validateHeaderName, validateHeaderValue } = require('http')
const { kHeadersList } = require('../core/symbols')
const { kGuard } = require('./symbols')
const { kEnumerableProperty } = require('../core/util')
const {
  InvalidHTTPTokenError,
  HTTPInvalidHeaderValueError,
  InvalidThisError
} = require('../core/errors')
const {
  forbiddenHeaderNames,
  forbiddenResponseHeaderNames
} = require('./constants')

function binarySearch (arr, val) {
  let low = 0
  let high = Math.floor(arr.length / 2)

  while (high > low) {
    const mid = (high + low) >>> 1

    if (val.localeCompare(arr[mid * 2]) > 0) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  return low * 2
}

function normalizeAndValidateHeaderName (name) {
  if (name === undefined) {
    throw new InvalidHTTPTokenError(`Header name ${name}`)
  }
  const normalizedHeaderName = name.toLocaleLowerCase()
  validateHeaderName(normalizedHeaderName)
  return normalizedHeaderName
}

function normalizeAndValidateHeaderValue (name, value) {
  if (value === undefined) {
    throw new HTTPInvalidHeaderValueError(value, name)
  }
  const normalizedHeaderValue = `${value}`.replace(
    /^[\n\t\r\x20]+|[\n\t\r\x20]+$/g,
    ''
  )
  validateHeaderValue(name, normalizedHeaderValue)
  return normalizedHeaderValue
}

function isHeaders (object) {
  return kHeadersList in object
}

function fill (headers, object) {
  // To fill a Headers object headers with a given object object, run these steps:

  if (object[Symbol.iterator]) {
    // 1. If object is a sequence, then for each header in object:
    // TODO: How to check if sequence?
    for (let header of object) {
      // 1. If header does not contain exactly two items, then throw a TypeError.
      if (!header[Symbol.iterator]) {
        // TODO: Spec doesn't define what to do here?
        throw new TypeError()
      }

      if (typeof header === 'string') {
        // TODO: Spec doesn't define what to do here?
        throw new TypeError()
      }

      if (!Array.isArray(header)) {
        header = [...header]
      }

      if (header.length !== 2) {
        throw new TypeError()
      }

      // 2. Append header’s first item/header’s second item to headers.
      headers.append(header[0], header[1])
    }
  } else if (object && typeof object === 'object') {
    // Otherwise, object is a record, then for each key → value in object,
    // append key/value to headers.
    // TODO: How to check if record?
    for (const header of Object.entries(object)) {
      headers.append(header[0], header[1])
    }
  } else {
    // TODO: Spec doesn't define what to do here?
    throw TypeError()
  }
}

function validateArgumentLength (found, expected) {
  if (found !== expected) {
    throw new TypeError(
      `${expected} ${
        expected > 1 ? 'arguments' : 'argument'
      } required, but only ${found} present`
    )
  }
}

class HeadersList extends Array {
  append (...args) {
    validateArgumentLength(args.length, 2)

    const [name, value] = args
    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const index = binarySearch(this, normalizedName)

    if (this[index] === normalizedName) {
      this[index + 1] += `, ${normalizedValue}`
    } else {
      this.splice(index, 0, normalizedName, normalizedValue)
    }
  }

  delete (...args) {
    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this, normalizedName)

    if (this[index] === normalizedName) {
      this.splice(index, 2)
    }
  }

  get (...args) {
    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this, normalizedName)

    if (this[index] === normalizedName) {
      return this[index + 1]
    }

    return null
  }

  has (...args) {
    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this, normalizedName)

    return this[index] === normalizedName
  }

  set (...args) {
    validateArgumentLength(args.length, 2)

    const [name, value] = args

    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const index = binarySearch(this, normalizedName)
    if (this[index] === normalizedName) {
      this[index + 1] = normalizedValue
    } else {
      this.splice(index, 0, normalizedName, normalizedValue)
    }
  }
}

class Headers {
  constructor (init = {}) {
    this[kHeadersList] = new HeadersList()

    // The new Headers(init) constructor steps are:

    // 1. Set this’s guard to "none".
    this[kGuard] = 'none'

    // 2. If init is given, then fill this with init.
    fill(this[kHeadersList], init)
  }

  get [Symbol.toStringTag] () {
    return this.constructor.name
  }

  toString () {
    return Object.prototype.toString.call(this)
  }

  append (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    const normalizedName = normalizeAndValidateHeaderName(args[0])

    if (this[kGuard] === 'immutable') {
      throw new TypeError('immutable')
    } else if (
      this[kGuard] === 'request' &&
      forbiddenHeaderNames.includes(normalizedName)
    ) {
      return
    } else if (this[kGuard] === 'request-no-cors') {
      // TODO
    } else if (
      this[kGuard] === 'response' &&
      forbiddenResponseHeaderNames.includes(normalizedName)
    ) {
      return
    }

    return this[kHeadersList].append(...args)
  }

  delete (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    const normalizedName = normalizeAndValidateHeaderName(args[0])

    if (this[kGuard] === 'immutable') {
      throw new TypeError('immutable')
    } else if (
      this[kGuard] === 'request' &&
      forbiddenHeaderNames.includes(normalizedName)
    ) {
      return
    } else if (this[kGuard] === 'request-no-cors') {
      // TODO
    } else if (
      this[kGuard] === 'response' &&
      forbiddenResponseHeaderNames.includes(normalizedName)
    ) {
      return
    }

    return this[kHeadersList].delete(...args)
  }

  get (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    return this[kHeadersList].get(...args)
  }

  has (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    return this[kHeadersList].has(...args)
  }

  set (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    const normalizedName = normalizeAndValidateHeaderName(args[0])

    if (this[kGuard] === 'immutable') {
      throw new TypeError('immutable')
    } else if (
      this[kGuard] === 'request' &&
      forbiddenHeaderNames.includes(normalizedName)
    ) {
      return
    } else if (this[kGuard] === 'request-no-cors') {
      // TODO
    } else if (
      this[kGuard] === 'response' &&
      forbiddenResponseHeaderNames.includes(normalizedName)
    ) {
      return
    }

    return this[kHeadersList].set(...args)
  }

  * keys () {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Headers')
    }

    for (let index = 0; index < this[kHeadersList].length; index += 2) {
      yield this[kHeadersList][index]
    }
  }

  * values () {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Headers')
    }

    for (let index = 1; index < this[kHeadersList].length; index += 2) {
      yield this[kHeadersList][index]
    }
  }

  * entries () {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Headers')
    }

    for (let index = 0; index < this[kHeadersList].length; index += 2) {
      yield [this[kHeadersList][index], this[kHeadersList][index + 1]]
    }
  }

  forEach (callback, thisArg) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Headers')
    }

    for (let index = 0; index < this[kHeadersList].length; index += 2) {
      callback.call(
        thisArg,
        this[kHeadersList][index + 1],
        this[kHeadersList][index],
        this
      )
    }
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    return this[kHeadersList]
  }
}

Headers.prototype[Symbol.iterator] = Headers.prototype.entries

Object.defineProperties(Headers.prototype, {
  append: kEnumerableProperty,
  delete: kEnumerableProperty,
  get: kEnumerableProperty,
  has: kEnumerableProperty,
  set: kEnumerableProperty,
  keys: kEnumerableProperty,
  values: kEnumerableProperty,
  entries: kEnumerableProperty,
  forEach: kEnumerableProperty
})

module.exports = { fill, Headers, HeadersList }
