// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { types } = require('util')
const { validateHeaderName, validateHeaderValue } = require('http')
const { kHeadersList } = require('../core/symbols')

const headerRegex = /^[\n\t\r\x20]+|[\n\t\r\x20]+$/g

function normalizeAndValidateHeaderName (name) {
  const normalizedHeaderName = name.toLowerCase()
  validateHeaderName(normalizedHeaderName)
  return normalizedHeaderName
}

function binarySearch (arr, val) {
  let low = 0
  let high = arr.length / 2

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

function normalizeAndValidateHeaderValue (name, value) {
  const normalizedHeaderValue = `${value}`.replace(headerRegex, '')
  validateHeaderValue(name, normalizedHeaderValue)
  return normalizedHeaderValue
}

function fill (headers, object) {
  if (Array.isArray(object)) {
    if (Array.isArray(object[0])) {
      for (let i = 0, header = object[0]; i < object.length; i++, header = object[i]) {
        if (header.length !== 2) throw TypeError('header entry must be of length two')
        headers.append(header[0], header[1])
      }
    } else if (typeof object[0] === 'string' || Buffer.isBuffer(object[0])) {
      if (object.length % 2 !== 0) throw TypeError('flattened header init must have even length')
      for (let i = 0; i < object.length; i += 2) {
        headers.append(object[i].toString('utf-8'), object[i + 1].toString('utf-8'))
      }
    } else {
      if (object.length !== 0) throw TypeError('invalid array-based header init')
    }
  } else if (kHeadersList in object) {
    headers[kHeadersList] = new Array(...object[kHeadersList])
  } else if (!types.isBoxedPrimitive(object)) {
    for (const [name, value] of Object.entries(object)) {
      headers.append(name, value)
    }
  }
}

class Headers {
  constructor (init) {
    this[kHeadersList] = []

    if (init && typeof init === 'object') {
      fill(this, init)
    }
  }

  append (...args) {
    if (args.length !== 2) throw TypeError('Expected at least 2 arguments!')
    const [name, value] = args
    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const i = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][i] === normalizedName) {
      this[kHeadersList][i + 1] += `, ${normalizedValue}`
    } else {
      this[kHeadersList].splice(i, 0, normalizedName, normalizedValue)
    }
  }

  delete (name) {
    const normalizedName = normalizeAndValidateHeaderName(name)

    const i = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][i] === normalizedName) {
      this[kHeadersList].splice(i, 2)
    }
  }

  get (name) {
    const normalizedName = normalizeAndValidateHeaderName(name)

    const i = binarySearch(this[kHeadersList], normalizedName)

    if (this[kHeadersList][i] === normalizedName) {
      return this[kHeadersList][i + 1]
    }

    return null
  }

  has (name) {
    const normalizedName = normalizeAndValidateHeaderName(name)

    const i = binarySearch(this[kHeadersList], normalizedName)

    return this[kHeadersList][i] === normalizedName
  }

  set (...args) {
    if (args.length !== 2) throw TypeError('Expected at least 2 arguments!')
    const [name, value] = args

    const normalizedName = normalizeAndValidateHeaderName(name)
    const normalizedValue = normalizeAndValidateHeaderValue(name, value)

    const i = binarySearch(this[kHeadersList], normalizedName)
    if (this[kHeadersList][i] === normalizedName) {
      this[kHeadersList][i + 1] = normalizedValue
    } else {
      this[kHeadersList].splice(i, 0, normalizedName, normalizedValue)
    }
  }

  * keys () {
    for (const header of this) {
      yield header[0]
    }
  }

  * values () {
    for (const header of this) {
      yield header[1]
    }
  }

  * entries () {
    yield * this
  }

  forEach (callback, thisArg) {
    for (let i = 0; i < this[kHeadersList].length; i += 2) {
      callback.call(thisArg, this[kHeadersList][i + 1], this[kHeadersList][i], this)
    }
  }

  * [Symbol.iterator] () {
    for (let i = 0; i < this[kHeadersList].length; i += 2) {
      yield [this[kHeadersList][i], this[kHeadersList][i + 1]]
    }
  }
}

module.exports = Headers
