// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { types } = require('util')
const { validateHeaderName, validateHeaderValue } = require('http')
const { kHeadersList } = require('../../core/symbols')
const { InvalidHTTPTokenError, HTTPInvalidHeaderValueError, InvalidArgumentError, InvalidThisError } = require('../../core/errors')

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
  const normalizedHeaderValue = `${value}`.replace(/^[\n\t\r\x20]+|[\n\t\r\x20]+$/g, '')
  validateHeaderValue(name, normalizedHeaderValue)
  return normalizedHeaderValue
}

function isHeaders (object) {
  return kHeadersList in object
}

function fill (headers, object) {
  if (isHeaders(object)) {
    // Object is instance of Headers
    headers[kHeadersList] = Array.splice(object[kHeadersList])
  } else if (Array.isArray(object)) {
    // Support both 1D and 2D arrays of header entries
    if (Array.isArray(object[0])) {
      // Array of arrays
      for (let i = 0; i < object.length; i++) {
        if (object[i].length !== 2) {
          throw new InvalidArgumentError(`The argument 'init' is not of length 2. Received ${object[i]}`)
        }
        headers.append(object[i][0], object[i][1])
      }
    } else if (typeof object[0] === 'string' || Buffer.isBuffer(object[0])) {
      // Flat array of strings or Buffers
      if (object.length % 2 !== 0) {
        throw new InvalidArgumentError(`The argument 'init' is not even in length. Received ${object}`)
      }
      for (let i = 0; i < object.length; i += 2) {
        headers.append(
          object[i].toString('utf-8'),
          object[i + 1].toString('utf-8')
        )
      }
    } else {
      // All other array based entries
      throw new InvalidArgumentError(`The argument 'init' is not a valid array entry. Received ${object}`)
    }
  } else if (!types.isBoxedPrimitive(object)) {
    // Object of key/value entries
    const entries = Object.entries(object)
    for (let i = 0; i < entries.length; i++) {
      headers.append(entries[i][0], entries[i][1])
    }
  }
}

function validateArgumentLength (found, expected) {
  if (found !== expected) {
    throw new TypeError(`${expected} ${expected > 1 ? 'arguments' : 'argument'} required, but only ${found} present`)
  }
}

class Headers {
  constructor (init = {}) {
    // validateObject allowArray = true
    if (!Array.isArray(init) && typeof init !== 'object') {
      throw new InvalidArgumentError('The argument \'init\' must be one of type Object or Array')
    }
    this[kHeadersList] = []
    fill(this, init)
  }

  append (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    validateArgumentLength(args.length, 2)

    const [name, value] = args
    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const index = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][index] === normalizedName) {
      this[kHeadersList][index + 1] += `, ${normalizedValue}`
    } else {
      this[kHeadersList].splice(index, 0, normalizedName, normalizedValue)
    }
  }

  delete (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][index] === normalizedName) {
      this[kHeadersList].splice(index, 2)
    }
  }

  get (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][index] === normalizedName) {
      return this[kHeadersList][index + 1]
    }

    return null
  }

  has (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    validateArgumentLength(args.length, 1)

    const [name] = args

    const normalizedName = normalizeAndValidateHeaderName(name)

    const index = binarySearch(this[kHeadersList], normalizedName)

    return this[kHeadersList][index] === normalizedName
  }

  set (...args) {
    if (!isHeaders(this)) {
      throw new InvalidThisError('Header')
    }

    validateArgumentLength(args.length, 2)

    const [name, value] = args

    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const index = binarySearch(this[kHeadersList], normalizedName)
    if (this[kHeadersList][index] === normalizedName) {
      this[kHeadersList][index + 1] = normalizedValue
    } else {
      this[kHeadersList].splice(index, 0, normalizedName, normalizedValue)
    }
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
      callback.call(thisArg, this[kHeadersList][index + 1], this[kHeadersList][index], this)
    }
  }
}

Headers.prototype[Symbol.iterator] = Headers.prototype.entries

module.exports = Headers
