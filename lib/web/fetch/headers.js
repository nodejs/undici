// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const { kConstruct } = require('../../core/symbols')
const { kEnumerableProperty } = require('../../core/util')
const { iteratorMixin } = require('./util')
const { webidl } = require('../webidl')
const util = require('node:util')

/**
 * HTTP token code points (RFC 7230).
 * @see https://tools.ietf.org/html/rfc7230#section-3.2.6
 */
const TOKEN_CHARS = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0-15
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16-31
  0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, // 32-47 (!"#$%&'()*+,-./)
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48-63 (0-9:;<=>?)
  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64-79 (@A-O)
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, // 80-95 (P-Z[\]^_)
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96-111 (`a-o)
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, // 112-127 (p-z{|}~)
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 128-143
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 144-159
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 160-175
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 176-191
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 192-207
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 208-223
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 224-239
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0  // 240-255
])

/**
 * Pre-validated lowercase names. `Set#has` avoids a token scan + toLowerCase
 * on the hottest Headers read path (get/has/delete of common headers).
 */
const COMMON_HEADER_NAMES = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'accept-ranges',
  'access-control-allow-credentials',
  'access-control-allow-headers',
  'access-control-allow-methods',
  'access-control-allow-origin',
  'access-control-expose-headers',
  'access-control-max-age',
  'access-control-request-headers',
  'access-control-request-method',
  'age',
  'authorization',
  'cache-control',
  'connection',
  'content-disposition',
  'content-encoding',
  'content-language',
  'content-length',
  'content-range',
  'content-security-policy',
  'content-type',
  'cookie',
  'date',
  'etag',
  'expect',
  'expires',
  'forwarded',
  'host',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'keep-alive',
  'last-modified',
  'link',
  'location',
  'origin',
  'pragma',
  'proxy-authorization',
  'range',
  'referer',
  'referrer-policy',
  'sec-fetch-mode',
  'sec-websocket-accept',
  'sec-websocket-extensions',
  'sec-websocket-key',
  'sec-websocket-protocol',
  'sec-websocket-version',
  'server',
  'set-cookie',
  'strict-transport-security',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'vary',
  'via',
  'www-authenticate',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-request-id'
])

/**
 * @param {number} code
 * @returns {code is (0x0a | 0x0d | 0x09 | 0x20)}
 */
function isHTTPWhiteSpaceCharCode (code) {
  return code === 0x0a || code === 0x0d || code === 0x09 || code === 0x20
}

function brandCheckHeaders (V) {
  // `instanceof` is cheaper than webidl's @@hasInstance bind and has no
  // per-instance WeakSet cost on the constructor path.
  if (!(V instanceof Headers)) {
    const err = new TypeError('Illegal invocation')
    err.code = 'ERR_INVALID_THIS'
    throw err
  }
}

function throwArgumentLength (prefix, min, length) {
  throw webidl.errors.exception({
    message: `${min} argument${min !== 1 ? 's' : ''} required, ` +
             `but${length ? ' only' : ''} ${length} found.`,
    header: prefix
  })
}

function throwByteStringChar (index, code) {
  throw new TypeError(
    'Cannot convert argument to a ByteString because the character at ' +
    `index ${index} has a value of ${code} which is greater than 255.`
  )
}

/**
 * WebIDL ByteString conversion without iterating the string twice.
 * @param {unknown} V
 * @param {string} prefix
 * @param {string} argument
 * @returns {string}
 */
function toByteString (V, prefix, argument) {
  if (typeof V === 'symbol') {
    throw webidl.errors.exception({
      header: prefix,
      message: `${argument} is a symbol, which cannot be converted to a ByteString.`
    })
  }

  return typeof V === 'string' ? V : String(V)
}

/**
 * Validate a header name and return it lowercased.
 * ByteString (char > 255) is checked before token validity, matching WebIDL.
 * @param {string} name
 * @param {string} prefix
 * @param {boolean} checkHighChars
 * @returns {string}
 */
function canonicalizeHeaderName (name, prefix, checkHighChars) {
  const len = name.length
  let hasUpper = false
  let valid = len !== 0

  for (let i = 0; i < len; ++i) {
    const c = name.charCodeAt(i)
    if (checkHighChars && c > 255) {
      throwByteStringChar(i, c)
    }
    if (TOKEN_CHARS[c] !== 1) {
      valid = false
    } else if (c >= 65 && c <= 90) {
      hasUpper = true
    }
  }

  if (!valid) {
    throw webidl.errors.invalidArgument({
      prefix,
      value: name,
      type: 'header name'
    })
  }

  return hasUpper ? name.toLowerCase() : name
}

/**
 * @param {unknown} V
 * @param {string} prefix
 * @param {string} argument
 * @returns {string} lowercase header name
 */
function convertHeaderName (V, prefix, argument) {
  if (typeof V === 'string' && COMMON_HEADER_NAMES.has(V)) {
    return V
  }

  return canonicalizeHeaderName(toByteString(V, prefix, argument), prefix, true)
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-header-value-normalize
 * Normalize and validate a header value. After trimming HTTP whitespace,
 * only NUL / CR / LF remain as value errors (leading/trailing SP/HTAB are gone).
 * @param {string} value
 * @param {string} prefix
 * @param {boolean} checkHighChars
 * @returns {string}
 */
function canonicalizeHeaderValue (value, prefix, checkHighChars) {
  //  To normalize a byte sequence potentialValue, remove
  //  any leading and trailing HTTP whitespace bytes from
  //  potentialValue.
  const len = value.length
  let start = 0
  let end = len

  if (checkHighChars) {
    for (let i = 0; i < len; ++i) {
      const c = value.charCodeAt(i)
      if (c > 255) {
        throwByteStringChar(i, c)
      }
    }
  }

  while (end > start && isHTTPWhiteSpaceCharCode(value.charCodeAt(end - 1))) --end
  while (end > start && isHTTPWhiteSpaceCharCode(value.charCodeAt(start))) ++start

  for (let i = start; i < end; ++i) {
    const c = value.charCodeAt(i)
    if (c === 0x00 || c === 0x0a || c === 0x0d) {
      const normalized = start === 0 && end === len ? value : value.substring(start, end)
      throw webidl.errors.invalidArgument({
        prefix,
        value: normalized,
        type: 'header value'
      })
    }
  }

  return start === 0 && end === len ? value : value.substring(start, end)
}

/**
 * @param {unknown} V
 * @param {string} prefix
 * @param {string} argument
 * @returns {string}
 */
function convertHeaderValue (V, prefix, argument) {
  return canonicalizeHeaderValue(toByteString(V, prefix, argument), prefix, true)
}

/**
 * @param {boolean} isLowerCase
 * @param {string} name
 * @returns {string}
 */
function lowercaseHeaderName (name, isLowerCase) {
  if (isLowerCase === true) {
    return name
  }
  if (typeof isLowerCase === 'string') {
    return isLowerCase
  }
  return name.toLowerCase()
}

/**
 * @param {Headers} headers
 * @param {Array|Object} object
 */
function fill (headers, object) {
  // To fill a Headers object headers with a given object object, run these steps:
  const list = getHeadersList(headers)
  const immutable = getHeadersGuard(headers) === 'immutable'

  // 1. If object is a sequence, then for each header in object:
  // Note: webidl conversion to array has already been done.
  if (Array.isArray(object)) {
    for (let i = 0; i < object.length; ++i) {
      const header = object[i]
      // 1. If header does not contain exactly two items, then throw a TypeError.
      if (header.length !== 2) {
        throw webidl.errors.exception({
          header: 'Headers constructor',
          message: `expected name/value pair to be length 2, found ${header.length}.`
        })
      }

      // 2. Append (header’s first item, header’s second item) to headers.
      appendHeaderToList(list, header[0], header[1], immutable)
    }
  } else if (typeof object === 'object' && object !== null) {
    // Note: null should throw

    // 2. Otherwise, object is a record, then for each key → value in object,
    //    append (key, value) to headers
    const keys = Object.keys(object)
    for (let i = 0; i < keys.length; ++i) {
      appendHeaderToList(list, keys[i], object[keys[i]], immutable)
    }
  } else {
    throw webidl.errors.conversionFailed({
      prefix: 'Headers constructor',
      argument: 'Argument 1',
      types: ['sequence<sequence<ByteString>>', 'record<ByteString, ByteString>']
    })
  }
}

/**
 * @see https://fetch.spec.whatwg.org/#concept-headers-append
 * @param {Headers} headers
 * @param {string} name already a ByteString
 * @param {string} value already a ByteString
 */
function appendHeaderToList (list, name, value, immutable) {
  // 1. Normalize value.
  // 2. If name is not a header name or value is not a
  //    header value, then throw a TypeError.
  const lower = typeof name === 'string' && COMMON_HEADER_NAMES.has(name)
    ? name
    : canonicalizeHeaderName(name, 'Headers.append', false)
  const normalized = canonicalizeHeaderValue(value, 'Headers.append', false)

  // 3. If headers’s guard is "immutable", then throw a TypeError.
  // 4. Otherwise, if headers’s guard is "request" and name is a
  //    forbidden header name, return.
  // 5. Otherwise, if headers’s guard is "request-no-cors":
  //    TODO
  // Note: undici does not implement forbidden header names
  if (immutable) {
    throw new TypeError('immutable')
  }

  // 6. Otherwise, if headers’s guard is "response" and name is a
  //    forbidden response-header name, return.

  // 7. Append (name, value) to headers’s header list.
  list.append(name, normalized, lower)

  // 8. If headers’s guard is "request-no-cors", then remove
  //    privileged no-CORS request headers from headers
}

// https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
/**
 * @param {Headers} target
 */
function headersListSortAndCombine (target) {
  const headersList = getHeadersList(target)

  if (!headersList) {
    return []
  }

  if (headersList.sortedMap) {
    return headersList.sortedMap
  }

  // 1. Let headers be an empty list of headers with the key being the name
  //    and value the value.
  const headers = []

  // 2. Let names be the result of convert header names to a sorted-lowercase
  //    set with all the names of the headers in list.
  const names = headersList.toSortedArray()

  const cookies = headersList.cookies

  // fast-path
  if (cookies === null || cookies.length === 1) {
    // Note: The non-null assertion of value has already been done by `HeadersList#toSortedArray`
    return (headersList.sortedMap = names)
  }

  // 3. For each name of names:
  for (let i = 0; i < names.length; ++i) {
    const { 0: name, 1: value } = names[i]
    // 1. If name is `set-cookie`, then:
    if (name === 'set-cookie') {
      // 1. Let values be a list of all values of headers in list whose name
      //    is a byte-case-insensitive match for name, in order.

      // 2. For each value of values:
      // 1. Append (name, value) to headers.
      for (let j = 0; j < cookies.length; ++j) {
        headers.push([name, cookies[j]])
      }
    } else {
      // 2. Otherwise:

      // 1. Let value be the result of getting name from list.

      // 2. Assert: value is non-null.
      // Note: This operation was done by `HeadersList#toSortedArray`.

      // 3. Append (name, value) to headers.
      headers.push([name, value])
    }
  }

  // 4. Return headers.
  return (headersList.sortedMap = headers)
}

function compareHeaderName (a, b) {
  return a[0] < b[0] ? -1 : 1
}

class HeadersList {
  /** @type {string[]|null} */
  cookies = null

  /** @type {[string, string][]|null} */
  sortedMap

  /** @type {Map<string, string>} lowercase name → combined value */
  headersMap

  /** @type {Map<string, string>|null} lowercase name → first-seen original name */
  originalNames = null

  constructor (init) {
    if (init instanceof HeadersList) {
      this.headersMap = new Map(init.headersMap)
      this.sortedMap = init.sortedMap
      this.cookies = init.cookies === null ? null : [...init.cookies]
      this.originalNames = init.originalNames === null ? null : new Map(init.originalNames)
    } else {
      this.headersMap = new Map(init)
      this.sortedMap = null
    }
  }

  /**
   * @see https://fetch.spec.whatwg.org/#header-list-contains
   * @param {string} name
   * @param {boolean} isLowerCase
   */
  contains (name, isLowerCase) {
    // A header list list contains a header name name if list
    // contains a header whose name is a byte-case-insensitive
    // match for name.

    return this.headersMap.has(lowercaseHeaderName(name, isLowerCase))
  }

  clear () {
    this.headersMap.clear()
    this.sortedMap = null
    this.cookies = null
    this.originalNames = null
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-append
   * @param {string} name
   * @param {string} value
   * @param {boolean} isLowerCase
   */
  append (name, value, isLowerCase) {
    if (this.sortedMap !== null) {
      this.sortedMap = null
    }

    // 1. If list contains name, then set name to the first such
    //    header’s name.
    const lowercaseName = lowercaseHeaderName(name, isLowerCase)
    const exists = this.headersMap.get(lowercaseName)

    // 2. Append (name, value) to list.
    if (exists !== undefined) {
      this.headersMap.set(
        lowercaseName,
        lowercaseName === 'cookie' ? exists + '; ' + value : exists + ', ' + value
      )
    } else {
      this.headersMap.set(lowercaseName, value)
      if (name !== lowercaseName) {
        (this.originalNames ??= new Map()).set(lowercaseName, name)
      }
    }

    if (lowercaseName === 'set-cookie') {
      (this.cookies ??= []).push(value)
    }
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-set
   * @param {string} name
   * @param {string} value
   * @param {boolean} isLowerCase
   */
  set (name, value, isLowerCase) {
    if (this.sortedMap !== null) {
      this.sortedMap = null
    }

    const lowercaseName = lowercaseHeaderName(name, isLowerCase)

    if (lowercaseName === 'set-cookie') {
      this.cookies = [value]
    }

    // 1. If list contains name, then set the value of
    //    the first such header to value and remove the
    //    others.
    // 2. Otherwise, append header (name, value) to list.
    this.headersMap.set(lowercaseName, value)

    if (name !== lowercaseName) {
      (this.originalNames ??= new Map()).set(lowercaseName, name)
    } else if (this.originalNames !== null) {
      this.originalNames.delete(lowercaseName)
    }
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-delete
   * @param {string} name
   * @param {boolean} isLowerCase
   */
  delete (name, isLowerCase) {
    if (this.sortedMap !== null) {
      this.sortedMap = null
    }

    const lowercaseName = lowercaseHeaderName(name, isLowerCase)

    if (lowercaseName === 'set-cookie') {
      this.cookies = null
    }

    this.headersMap.delete(lowercaseName)
    this.originalNames?.delete(lowercaseName)
  }

  /**
   * @see https://fetch.spec.whatwg.org/#concept-header-list-get
   * @param {string} name
   * @param {boolean} isLowerCase
   * @returns {string | null}
   */
  get (name, isLowerCase) {
    // 1. If list does not contain name, then return null.
    // 2. Return the values of all headers in list whose name
    //    is a byte-case-insensitive match for name,
    //    separated from each other by 0x2C 0x20, in order.
    const value = this.headersMap.get(lowercaseHeaderName(name, isLowerCase))
    return value !== undefined ? value : null
  }

  [Symbol.iterator] () {
    // use the lowercased name
    return this.headersMap[Symbol.iterator]()
  }

  get entries () {
    const headers = {}
    const originalNames = this.originalNames

    for (const { 0: lower, 1: value } of this.headersMap) {
      headers[originalNames !== null ? (originalNames.get(lower) ?? lower) : lower] = value
    }

    return headers
  }

  * rawValues () {
    const originalNames = this.originalNames

    for (const { 0: lower, 1: value } of this.headersMap) {
      yield {
        name: originalNames !== null ? (originalNames.get(lower) ?? lower) : lower,
        value
      }
    }
  }

  get entriesList () {
    const headers = []
    const originalNames = this.originalNames
    const cookies = this.cookies

    for (const { 0: lowerName, 1: value } of this.headersMap) {
      const name = originalNames !== null ? (originalNames.get(lowerName) ?? lowerName) : lowerName
      if (lowerName === 'set-cookie') {
        for (let i = 0; i < cookies.length; ++i) {
          headers.push([name, cookies[i]])
        }
      } else {
        headers.push([name, value])
      }
    }

    return headers
  }

  // https://fetch.spec.whatwg.org/#convert-header-names-to-a-sorted-lowercase-set
  toSortedArray () {
    const size = this.headersMap.size
    const array = new Array(size)
    // In most cases, you will use the fast-path.
    // fast-path: Use binary insertion sort for small arrays.
    if (size <= 32) {
      if (size === 0) {
        // If empty, it is an empty array. To avoid the first index assignment.
        return array
      }
      // Improve performance by unrolling loop and avoiding double-loop.
      // Double-loop-less version of the binary insertion sort.
      const iterator = this.headersMap[Symbol.iterator]()
      const firstValue = iterator.next().value
      // set [name, value] to first index.
      array[0] = [firstValue[0], firstValue[1]]
      // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
      // 3.2.2. Assert: value is non-null.
      for (
        let i = 1, j = 0, right = 0, left = 0, pivot = 0, x, value;
        i < size;
        ++i
      ) {
        // get next value
        value = iterator.next().value
        // set [name, value] to current index.
        x = array[i] = [value[0], value[1]]
        // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
        // 3.2.2. Assert: value is non-null.
        left = 0
        right = i
        // binary search
        while (left < right) {
          // middle index
          pivot = left + ((right - left) >> 1)
          // compare header name
          if (array[pivot][0] <= x[0]) {
            left = pivot + 1
          } else {
            right = pivot
          }
        }
        if (i !== pivot) {
          j = i
          while (j > left) {
            array[j] = array[--j]
          }
          array[left] = x
        }
      }
      /* c8 ignore next 4 */
      if (!iterator.next().done) {
        // This is for debugging and will never be called.
        throw new TypeError('Unreachable')
      }
      return array
    } else {
      // This case would be a rare occurrence.
      // slow-path: fallback
      let i = 0
      for (const { 0: name, 1: value } of this.headersMap) {
        array[i++] = [name, value]
        // https://fetch.spec.whatwg.org/#concept-header-list-sort-and-combine
        // 3.2.2. Assert: value is non-null.
      }
      return array.sort(compareHeaderName)
    }
  }
}

// https://fetch.spec.whatwg.org/#headers-class
class Headers {
  #guard
  /**
   * @type {HeadersList}
   */
  #headersList

  /**
   * @param {HeadersInit|Symbol} [init]
   * @returns
   */
  constructor (init = undefined) {
    webidl.util.markAsUncloneable(this)

    if (init === kConstruct) {
      return
    }

    this.#headersList = new HeadersList()

    // The new Headers(init) constructor steps are:

    // 1. Set this’s guard to "none".
    this.#guard = 'none'

    // 2. If init is given, then fill this with init.
    if (init !== undefined) {
      this.#initialize(init)
    }
  }

  #initialize (init) {
    // Fast-path: copy an existing Headers list without re-validating.
    // Keep the iterator check so subclasses that override entries() still
    // go through the HeadersInit conversion path.
    if (
      init !== null &&
      typeof init === 'object' &&
      !util.types.isProxy(init) &&
      init instanceof Headers &&
      Reflect.get(init, Symbol.iterator) === Headers.prototype.entries
    ) {
      this.#headersList = new HeadersList(getHeadersList(init))
      return
    }

    fill(this, webidl.converters.HeadersInit(init, 'Headers constructor', 'init'))
  }

  // https://fetch.spec.whatwg.org/#dom-headers-append
  append (name, value) {
    brandCheckHeaders(this)

    if (arguments.length < 2) {
      throwArgumentLength('Headers.append', 2, arguments.length)
    }

    // 1. Normalize value.
    // 2. If name is not a header name or value is not a
    //    header value, then throw a TypeError.
    const rawName = toByteString(name, 'Headers.append', 'name')
    const lower = typeof rawName === 'string' && COMMON_HEADER_NAMES.has(rawName)
      ? rawName
      : canonicalizeHeaderName(rawName, 'Headers.append', true)
    const normalized = convertHeaderValue(value, 'Headers.append', 'value')

    // 3. If headers’s guard is "immutable", then throw a TypeError.
    // 4. Otherwise, if headers’s guard is "request" and name is a
    //    forbidden header name, return.
    // 5. Otherwise, if headers’s guard is "request-no-cors":
    //    TODO
    // Note: undici does not implement forbidden header names
    if (this.#guard === 'immutable') {
      throw new TypeError('immutable')
    }

    // 6. Otherwise, if headers’s guard is "response" and name is a
    //    forbidden response-header name, return.

    // 7. Append (name, value) to headers’s header list.
    // 8. If headers’s guard is "request-no-cors", then remove
    //    privileged no-CORS request headers from headers
    return this.#headersList.append(rawName, normalized, lower)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-delete
  delete (name) {
    brandCheckHeaders(this)

    if (arguments.length < 1) {
      throwArgumentLength('Headers.delete', 1, arguments.length)
    }

    // 1. If name is not a header name, then throw a TypeError.
    const lower = convertHeaderName(name, 'Headers.delete', 'name')

    // 2. If this’s guard is "immutable", then throw a TypeError.
    // 3. Otherwise, if this’s guard is "request" and name is a
    //    forbidden header name, return.
    // 4. Otherwise, if this’s guard is "request-no-cors", name
    //    is not a no-CORS-safelisted request-header name, and
    //    name is not a privileged no-CORS request-header name,
    //    return.
    // 5. Otherwise, if this’s guard is "response" and name is
    //    a forbidden response-header name, return.
    // Note: undici does not implement forbidden header names
    if (this.#guard === 'immutable') {
      throw new TypeError('immutable')
    }

    // 6. If this’s header list does not contain name, then
    //    return.
    if (!this.#headersList.contains(lower, true)) {
      return
    }

    // 7. Delete name from this’s header list.
    // 8. If this’s guard is "request-no-cors", then remove
    //    privileged no-CORS request headers from this.
    this.#headersList.delete(lower, true)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-get
  get (name) {
    brandCheckHeaders(this)

    if (arguments.length < 1) {
      throwArgumentLength('Headers.get', 1, arguments.length)
    }

    // 1. If name is not a header name, then throw a TypeError.
    // 2. Return the result of getting name from this’s header
    //    list.
    return this.#headersList.get(convertHeaderName(name, 'Headers.get', 'name'), true)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-has
  has (name) {
    brandCheckHeaders(this)

    if (arguments.length < 1) {
      throwArgumentLength('Headers.has', 1, arguments.length)
    }

    // 1. If name is not a header name, then throw a TypeError.
    // 2. Return true if this’s header list contains name;
    //    otherwise false.
    return this.#headersList.contains(convertHeaderName(name, 'Headers.has', 'name'), true)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-set
  set (name, value) {
    brandCheckHeaders(this)

    if (arguments.length < 2) {
      throwArgumentLength('Headers.set', 2, arguments.length)
    }

    // 1. Normalize value.
    // 2. If name is not a header name or value is not a
    //    header value, then throw a TypeError.
    const rawName = toByteString(name, 'Headers.set', 'name')
    const lower = typeof rawName === 'string' && COMMON_HEADER_NAMES.has(rawName)
      ? rawName
      : canonicalizeHeaderName(rawName, 'Headers.set', true)
    const normalized = convertHeaderValue(value, 'Headers.set', 'value')

    // 3. If this’s guard is "immutable", then throw a TypeError.
    // 4. Otherwise, if this’s guard is "request" and name is a
    //    forbidden header name, return.
    // 5. Otherwise, if this’s guard is "request-no-cors" and
    //    name/value is not a no-CORS-safelisted request-header,
    //    return.
    // 6. Otherwise, if this’s guard is "response" and name is a
    //    forbidden response-header name, return.
    // Note: undici does not implement forbidden header names
    if (this.#guard === 'immutable') {
      throw new TypeError('immutable')
    }

    // 7. Set (name, value) in this’s header list.
    // 8. If this’s guard is "request-no-cors", then remove
    //    privileged no-CORS request headers from this
    this.#headersList.set(rawName, normalized, lower)
  }

  // https://fetch.spec.whatwg.org/#dom-headers-getsetcookie
  getSetCookie () {
    brandCheckHeaders(this)

    // 1. If this’s header list does not contain `Set-Cookie`, then return « ».
    // 2. Return the values of all headers in this’s header list whose name is
    //    a byte-case-insensitive match for `Set-Cookie`, in order.

    const list = this.#headersList.cookies

    if (list) {
      return [...list]
    }

    return []
  }

  [util.inspect.custom] (depth, options) {
    options.depth ??= depth

    return `Headers ${util.formatWithOptions(options, this.#headersList.entries)}`
  }

  static getHeadersGuard (o) {
    return o.#guard
  }

  static setHeadersGuard (o, guard) {
    o.#guard = guard
  }

  /**
   * @param {Headers} o
   */
  static getHeadersList (o) {
    return o.#headersList
  }

  /**
   * @param {Headers} target
   * @param {HeadersList} list
   */
  static setHeadersList (target, list) {
    target.#headersList = list
  }
}

const { getHeadersGuard, setHeadersGuard, getHeadersList, setHeadersList } = Headers
Reflect.deleteProperty(Headers, 'getHeadersGuard')
Reflect.deleteProperty(Headers, 'setHeadersGuard')
Reflect.deleteProperty(Headers, 'getHeadersList')
Reflect.deleteProperty(Headers, 'setHeadersList')

iteratorMixin('Headers', Headers, headersListSortAndCombine, 0, 1)

Object.defineProperties(Headers.prototype, {
  append: kEnumerableProperty,
  delete: kEnumerableProperty,
  get: kEnumerableProperty,
  has: kEnumerableProperty,
  set: kEnumerableProperty,
  getSetCookie: kEnumerableProperty,
  [Symbol.toStringTag]: {
    value: 'Headers',
    configurable: true
  },
  [util.inspect.custom]: {
    enumerable: false
  }
})

webidl.converters.HeadersInit = function (V, prefix, argument) {
  if (webidl.util.Type(V) === webidl.util.Types.OBJECT) {
    const iterator = Reflect.get(V, Symbol.iterator)

    // A work-around to ensure we send the properly-cased Headers when V is a Headers object.
    // Read https://github.com/nodejs/undici/pull/3159#issuecomment-2075537226 before touching, please.
    if (!util.types.isProxy(V) && iterator === Headers.prototype.entries) { // Headers object
      try {
        return getHeadersList(V).entriesList
      } catch {
        // fall-through
      }
    }

    if (typeof iterator === 'function') {
      return webidl.converters['sequence<sequence<ByteString>>'](V, prefix, argument, iterator.bind(V))
    }

    return webidl.converters['record<ByteString, ByteString>'](V, prefix, argument)
  }

  throw webidl.errors.conversionFailed({
    prefix: 'Headers constructor',
    argument: 'Argument 1',
    types: ['sequence<sequence<ByteString>>', 'record<ByteString, ByteString>']
  })
}

module.exports = {
  fill,
  // for test.
  compareHeaderName,
  Headers,
  HeadersList,
  getHeadersGuard,
  setHeadersGuard,
  setHeadersList,
  getHeadersList
}
