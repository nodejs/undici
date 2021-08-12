'use strict'

const { Headers, HeadersList, fill } = require('./headers')
const { extractBody, cloneBody, mixinBody } = require('./body')
const util = require('../../core/util')
const { kEnumerableProperty } = util
const { responseURL } = require('./util')
const { redirectStatus, nullBodyStatus, forbiddenHeaderNames } = require('./constants')
const assert = require('assert')
const {
  kState,
  kHeaders,
  kGuard
} = require('./symbols')
const { kHeadersList } = require('../../core/symbols')

// https://fetch.spec.whatwg.org/#response-class
class Response {
  // Creates network error Response.
  static error () {
    // The static error() method steps are to return the result of creating a
    // Response object, given a new network error, "immutable", and this’s
    // relevant Realm.
    // TODO: relevant Realm?
    const responseObject = new Response()
    responseObject[kState] = makeNetworkError()
    responseObject[kHeaders][kHeadersList] = responseObject[kState].headersList
    responseObject[kHeaders][kGuard] = 'immutable'
    return responseObject
  }

  // Creates a redirect Response that redirects to url with status status.
  static redirect (url, status = 302) {
    // 1. Let parsedURL be the result of parsing url with current settings
    // object’s API base URL.
    // 2. If parsedURL is failure, then throw a TypeError.
    // TODO: base-URL?
    let parsedURL
    try {
      parsedURL = new URL(url)
    } catch (err) {
      const error = new TypeError()
      error.cause = err
      throw error
    }

    // 3. If status is not a redirect status, then throw a RangeError.
    if (!redirectStatus.includes(status)) {
      throw new RangeError(`Failed to construct 'Response': The status provided (${status}) is outside the range [200, 599].`)
    }

    // 4. Let responseObject be the result of creating a Response object,
    // given a new response, "immutable", and this’s relevant Realm.
    // TODO: relevant Realm?
    const responseObject = new Response()
    responseObject[kHeaders][kGuard] = 'immutable'

    // 5. Set responseObject’s response’s status to status.
    responseObject[kState].status = status

    // 6. Let value be parsedURL, serialized and isomorphic encoded.
    // TODO: isomorphic encoded?
    const value = parsedURL.toString()

    // 7. Append `Location`/value to responseObject’s response’s header list.
    responseObject[kState].headersList.push('location', value)

    // 8. Return responseObject.
    return responseObject
  }

  // https://fetch.spec.whatwg.org/#dom-response
  constructor (body = null, init = {}) {
    // 1. If init["status"] is not in the range 200 to 599, inclusive, then
    // throw a RangeError.
    if ('status' in init) {
      if (!Number.isFinite(init.status)) {
        throw new TypeError()
      }

      if (init.status < 200 || init.status > 599) {
        throw new RangeError()
      }
    }

    if ('statusText' in init) {
      if (typeof init.statusText !== 'string') {
        throw new TypeError()
      }

      // 2. If init["statusText"] does not match the reason-phrase token
      // production, then throw a TypeError.
      // See, https://datatracker.ietf.org/doc/html/rfc7230#section-3.1.2:
      //   reason-phrase  = *( HTAB / SP / VCHAR / obs-text )
      // TODO
    }

    // 3. Set this’s response to a new response.
    this[kState] = makeResponse({})

    // 4. Set this’s headers to a new Headers object with this’s relevant
    // Realm, whose header list is this’s response’s header list and guard
    // is "response".
    // TODO: relevant Realm?
    this[kHeaders] = new Headers()
    this[kHeaders][kGuard] = 'response'
    this[kHeaders][kHeadersList] = this[kState].headersList

    // 5. Set this’s response’s status to init["status"].
    if ('status' in init) {
      this[kState].status = init.status
    }

    // 6. Set this’s response’s status message to init["statusText"].
    if ('statusText' in init) {
      this[kState].statusText = init.statusText
    }

    // 7. If init["headers"] exists, then fill this’s headers with init["headers"].
    if ('headers' in init) {
      fill(this[kState].headersList, init.headers)
    }

    // 8. If body is non-null, then:
    if (body !== null) {
      // 1. If init["status"] is a null body status, then throw a TypeError.
      if (nullBodyStatus.includes(init.status)) {
        throw new TypeError()
      }

      // 2. Let Content-Type be null.
      // 3. Set this’s response’s body and Content-Type to the result of
      // extracting body.
      const [extractedBody, contentType] = extractBody(body)
      this[kState].body = extractedBody

      // 4. If Content-Type is non-null and this’s response’s header list does
      //  not contain `Content-Type`, then append `Content-Type`/Content-Type
      // to this’s response’s header list.
      if (contentType && !this.headers.has('content-type')) {
        this.headers.set('content-type', contentType)
      }
    }
  }

  get [Symbol.toStringTag] () {
    return this.constructor.name
  }

  toString () {
    return Object.prototype.toString.call(this)
  }

  // Returns response’s type, e.g., "cors".
  get type () {
    // The type getter steps are to return this’s response’s type.
    return this[kState].type
  }

  // Returns response’s URL, if it has one; otherwise the empty string.
  get url () {
    // The url getter steps are to return the empty string if this’s
    // response’s URL is null; otherwise this’s response’s URL,
    // serialized with exclude fragment set to true.
    let url = responseURL(this[kState])

    if (url == null) {
      return ''
    }

    if (url.hash) {
      url = new URL(url)
      url.hash = ''
    }

    return url.toString()
  }

  // Returns whether response was obtained through a redirect.
  get redirected () {
    // The redirected getter steps are to return true if this’s response’s URL
    // list has more than one item; otherwise false.
    return this[kState].urlList.length > 1
  }

  // Returns response’s status.
  get status () {
    // The status getter steps are to return this’s response’s status.
    return this[kState].status
  }

  // Returns whether response’s status is an ok status.
  get ok () {
    // The ok getter steps are to return true if this’s response’s status is an
    // ok status; otherwise false.
    return this[kState].status >= 200 && this[kState].status <= 299
  }

  // Returns response’s status message.
  get statusText () {
    // The statusText getter steps are to return this’s response’s status
    // message.
    return this[kState].statusText
  }

  // Returns response’s headers as Headers.
  get headers () {
    // The headers getter steps are to return this’s headers.
    return this[kHeaders]
  }

  // Returns a clone of response.
  clone () {
    // 1. If this is unusable, then throw a TypeError.
    if (this.bodyUsed || (this.body && this.body.locked)) {
      throw new TypeError()
    }

    // 2. Let clonedResponse be the result of cloning this’s response.
    const clonedResponse = cloneResponse(this[kState])

    // 3. Return the result of creating a Response object, given
    // clonedResponse, this’s headers’s guard, and this’s relevant Realm.
    // TODO: relevant Realm?
    const clonedResponseObject = new Response()
    clonedResponseObject[kState] = clonedResponse
    clonedResponseObject[kHeaders][kHeadersList] = clonedResponse.headersList
    clonedResponseObject[kHeaders][kGuard] = this[kHeaders][kGuard]

    return clonedResponseObject
  }
}
mixinBody(Response.prototype)

Object.defineProperties(Response.prototype, {
  type: kEnumerableProperty,
  url: kEnumerableProperty,
  status: kEnumerableProperty,
  ok: kEnumerableProperty,
  redirected: kEnumerableProperty,
  statusText: kEnumerableProperty,
  headers: kEnumerableProperty,
  clone: kEnumerableProperty
})

// https://fetch.spec.whatwg.org/#concept-response-clone
function cloneResponse (response) {
  // To clone a response response, run these steps:

  // 1. If response is a filtered response, then return a new identical
  // filtered response whose internal response is a clone of response’s
  // internal response.
  if (response.internalResponse) {
    return filterResponse(cloneResponse(response.internalResponse), response.type)
  }

  // 2. Let newResponse be a copy of response, except for its body.
  const newResponse = makeResponse({ ...response, body: null })

  // 3. If response’s body is non-null, then set newResponse’s body to the
  // result of cloning response’s body.
  if (response.body !== null) {
    newResponse.body = cloneBody(response.body)
  }

  // 4. Return newResponse.
  return newResponse
}

function makeResponse (init) {
  return {
    internalResponse: null,
    aborted: false,
    rangeRequested: false,
    timingAllowPassed: false,
    type: 'default',
    status: 200,
    timingInfo: null,
    statusText: '',
    ...init,
    headersList: init.headersList
      ? new HeadersList(...init.headersList)
      : new HeadersList(),
    urlList: init.urlList
      ? [...init.urlList]
      : []
  }
}

function makeNetworkError (reason) {
  return makeResponse({
    type: 'error',
    status: 0,
    error: reason instanceof Error
      ? reason
      : new Error(reason ? String(reason) : reason),
    aborted: reason && reason.name === 'AbortError'
  })
}

function filterResponse (response, type) {
  // Set response to the following filtered response with response as its
  // internal response, depending on request’s response tainting:
  if (type === 'basic') {
    // A basic filtered response is a filtered response whose type is "basic"
    // and header list excludes any headers in internal response’s header list
    // whose name is a forbidden response-header name.

    const headers = []
    for (let n = 0; n < response.headersList.length; n += 2) {
      if (!forbiddenHeaderNames.includes(response.headersList[n])) {
        headers.push(response.headersList[n + 0], response.headersList[n + 1])
      }
    }

    return makeResponse({
      ...response,
      internalResponse: response,
      headersList: new HeadersList(...headers),
      type: 'basic'
    })
  } else if (type === 'cors') {
    // A CORS filtered response is a filtered response whose type is "cors"
    // and header list excludes any headers in internal response’s header
    // list whose name is not a CORS-safelisted response-header name, given
    // internal response’s CORS-exposed header-name list.

    // TODO: This is not correct...
    return makeResponse({
      ...response,
      internalResponse: response,
      type: 'cors'
    })
  } else if (type === 'opaque') {
    // An opaque filtered response is a filtered response whose type is
    // "opaque", URL list is the empty list, status is 0, status message
    // is the empty byte sequence, header list is empty, and body is null.

    return makeResponse({
      ...response,
      internalResponse: response,
      type: 'opaque',
      urlList: [],
      status: 0,
      statusText: '',
      body: null
    })
  } else if (type === 'opaqueredirect') {
    // An opaque-redirect filtered response is a filtered response whose type
    // is "opaqueredirect", status is 0, status message is the empty byte
    // sequence, header list is empty, and body is null.

    return makeResponse({
      ...response,
      internalResponse: response,
      type: 'opaqueredirect',
      status: 0,
      statusText: '',
      headersList: new HeadersList(),
      body: null
    })
  } else {
    assert(false)
  }
}

module.exports = { makeNetworkError, makeResponse, filterResponse, Response }
