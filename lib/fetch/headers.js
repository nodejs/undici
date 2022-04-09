// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { validateHeaderName, validateHeaderValue } = require('http')
const { kHeadersList } = require('../core/symbols')
const { kGuard } = require('./symbols')
const { kEnumerableProperty } = require('../core/util')
const {
  forbiddenHeaderNames,
  forbiddenResponseHeaderNames
} = require('./constants')

const kHeadersMap = Symbol('headers map')
const kHeadersSortedMap = Symbol('headers map sorted')

function normalizeAndValidateHeaderName (name) {
  if (name === undefined) {
    throw new TypeError(`Header name ${name}`)
  }
  const normalizedHeaderName = name.toLocaleLowerCase()
  validateHeaderName(normalizedHeaderName)
  return normalizedHeaderName
}

function normalizeAndValidateHeaderValue (name, value) {
  if (value === undefined) {
    throw new TypeError(value, name)
  }
  const normalizedHeaderValue = `${value}`.replace(
    /^[\n\t\r\x20]+|[\n\t\r\x20]+$/g,
    ''
  )
  validateHeaderValue(name, normalizedHeaderValue)
  return normalizedHeaderValue
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

class HeadersList {
  constructor (init) {
    if (init instanceof HeadersList) {
      this[kHeadersMap] = new Map(init[kHeadersMap])
      this[kHeadersSortedMap] = init[kHeadersSortedMap]
    } else {
      this[kHeadersMap] = new Map(init)
      this[kHeadersSortedMap] = null
    }
  }

  append (name, value) {
    this[kHeadersSortedMap] = null

    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const exists = this[kHeadersMap].get(normalizedName)

    if (exists) {
      this[kHeadersMap].set(normalizedName, `${exists}, ${normalizedValue}`)
    } else {
      this[kHeadersMap].set(normalizedName, `${normalizedValue}`)
    }
  }

  set (name, value) {
    this[kHeadersSortedMap] = null

    const normalizedName = normalizeAndValidateHeaderName(name)
    return this[kHeadersMap].set(normalizedName, value)
  }

  delete (name) {
    this[kHeadersSortedMap] = null

    const normalizedName = normalizeAndValidateHeaderName(name)
    return this[kHeadersMap].delete(normalizedName)
  }

  get (name) {
    const normalizedName = normalizeAndValidateHeaderName(name)
    return this[kHeadersMap].get(normalizedName) ?? null
  }

  has (name) {
    const normalizedName = normalizeAndValidateHeaderName(name)
    return this[kHeadersMap].has(normalizedName)
  }

  keys () {
    return this[kHeadersMap].keys()
  }

  values () {
    return this[kHeadersMap].values()
  }

  entries () {
    return this[kHeadersMap].entries()
  }

  [Symbol.iterator] () {
    return this[kHeadersMap][Symbol.iterator]()
  }
}

// https://fetch.spec.whatwg.org/#headers-class
class Headers {
  constructor (...args) {
    if (
      args[0] !== undefined &&
      !(typeof args[0] === 'object' && args[0] != null) &&
      !Array.isArray(args[0])
    ) {
      throw new TypeError(
        "Failed to construct 'Headers': The provided value is not of type '(record<ByteString, ByteString> or sequence<sequence<ByteString>>"
      )
    }
    const init = args.length >= 1 ? args[0] ?? {} : {}
    this[kHeadersList] = new HeadersList()

    // The new Headers(init) constructor steps are:

    // 1. Set this’s guard to "none".
    this[kGuard] = 'none'

    // 2. If init is given, then fill this with init.
    fill(this, init)
  }

  get [Symbol.toStringTag] () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return this.constructor.name
  }

  toString () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return Object.prototype.toString.call(this)
  }

  append (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 2) {
      throw new TypeError(
        `Failed to execute 'append' on 'Headers': 2 arguments required, but only ${args.length} present.`
      )
    }

    const normalizedName = normalizeAndValidateHeaderName(String(args[0]))

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

    return this[kHeadersList].append(String(args[0]), String(args[1]))
  }

  delete (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 1) {
      throw new TypeError(
        `Failed to execute 'delete' on 'Headers': 1 argument required, but only ${args.length} present.`
      )
    }

    const normalizedName = normalizeAndValidateHeaderName(String(args[0]))

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

    return this[kHeadersList].delete(String(args[0]))
  }

  get (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 1) {
      throw new TypeError(
        `Failed to execute 'get' on 'Headers': 1 argument required, but only ${args.length} present.`
      )
    }

    return this[kHeadersList].get(String(args[0]))
  }

  has (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 1) {
      throw new TypeError(
        `Failed to execute 'has' on 'Headers': 1 argument required, but only ${args.length} present.`
      )
    }

    return this[kHeadersList].has(String(args[0]))
  }

  set (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 2) {
      throw new TypeError(
        `Failed to execute 'set' on 'Headers': 2 arguments required, but only ${args.length} present.`
      )
    }

    if (this[kGuard] === 'immutable') {
      throw new TypeError('immutable')
    } else if (
      this[kGuard] === 'request' &&
      forbiddenHeaderNames.includes(String(args[0]).toLocaleLowerCase())
    ) {
      return
    } else if (this[kGuard] === 'request-no-cors') {
      // TODO
    } else if (
      this[kGuard] === 'response' &&
      forbiddenResponseHeaderNames.includes(String(args[0]).toLocaleLowerCase())
    ) {
      return
    }

    return this[kHeadersList].set(String(args[0]), String(args[1]))
  }

  get [kHeadersSortedMap] () {
    this[kHeadersList][kHeadersSortedMap] ??= new Map([...this[kHeadersList]].sort((a, b) => a[0] < b[0] ? -1 : 1))
    return this[kHeadersList][kHeadersSortedMap]
  }

  keys () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return this[kHeadersSortedMap].keys()
  }

  values () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return this[kHeadersSortedMap].values()
  }

  entries () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return this[kHeadersSortedMap].entries()
  }

  [Symbol.iterator] () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

    return this[kHeadersSortedMap]
  }

  forEach (...args) {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }
    if (args.length < 1) {
      throw new TypeError(
        `Failed to execute 'forEach' on 'Headers': 1 argument required, but only ${args.length} present.`
      )
    }
    if (typeof args[0] !== 'function') {
      throw new TypeError(
        "Failed to execute 'forEach' on 'Headers': parameter 1 is not of type 'Function'."
      )
    }
    const callback = args[0]
    const thisArg = args[1]

    this[kHeadersSortedMap].forEach((value, index) => {
      callback.apply(thisArg, [value, index, this])
    })
  }

  [Symbol.for('nodejs.util.inspect.custom')] () {
    if (!(this instanceof Headers)) {
      throw new TypeError('Illegal invocation')
    }

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

module.exports = {
  fill,
  Headers,
  HeadersList,
  normalizeAndValidateHeaderName,
  normalizeAndValidateHeaderValue
}
