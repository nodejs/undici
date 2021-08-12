// https://github.com/Ethan-Arrowood/undici-fetch

'use strict'

const {
  Response,
  makeNetworkError,
  filterResponse,
  makeResponse
} = require('./response')
const { Headers } = require('./headers')
const { Request, makeRequest } = require('./request')
const {
  requestBadPort,
  responseLocationURL,
  requestCurrentURL
} = require('./util')
const { kState, kHeaders, kGuard } = require('./symbols')
const { AbortError } = require('../core/errors')
const assert = require('assert')
const { safelyExtractBody, isBodyReadable } = require('./body')
const {
  redirectStatus,
  nullBodyStatus,
  safeMethods,
  requestBodyHeader
} = require('./constants')
const { kHeadersList } = require('../core/symbols')
const { ReadableStream } = require('stream/web')
const { performance } = require('perf_hooks')

// https://fetch.spec.whatwg.org/#fetch-method
async function fetch (resource, init) {
  const context = {
    dispatcher: this,
    abort: null,
    controller: null,
    terminated: false,
    terminate ({ aborted } = {}) {
      if (this.terminated) {
        return
      }

      this.terminated = { aborted }

      assert(!this.abort || aborted)

      if (this.abort) {
        this.abort()
        this.abort = null
      }
    }
  }

  // 1. Let p be a new promise.
  const p = createDeferredPromise()

  // 2. Let requestObject be the result of invoking the initial value of
  // Request as constructor with input and init as arguments. If this throws
  // an exception, reject p with it and return p.
  const requestObject = new Request(resource, init)

  // 3. Let request be requestObject’s request.
  const request = requestObject[kState]

  // 4. If requestObject’s signal’s aborted flag is set, then:
  if (requestObject.signal.aborted) {
    // 1. Abort fetch with p, request, and null.
    abortFetch.call(context, p, request, null)

    // 2. Return p.
    return p.promise
  }

  // 5. Let globalObject be request’s client’s global object.
  // TODO

  // 6. If globalObject is a ServiceWorkerGlobalScope object, then set
  // request’s service-workers mode to "none".
  // TODO

  // 7. Let responseObject be null.
  let responseObject = null

  // 8. Let relevantRealm be this’s relevant Realm.
  // TODO

  // 9. Let locallyAborted be false.
  let locallyAborted = false

  // 10. Add the following abort steps to requestObject’s signal:
  requestObject.signal.addEventListener(
    'abort',
    () => {
      // 1. Set locallyAborted to true.
      locallyAborted = true

      // 2. Abort fetch with p, request, and responseObject.
      abortFetch.call(context, p, request, responseObject)

      // 3. Terminate the ongoing fetch with the aborted flag set.
      context.terminate({ aborted: true })
    },
    { once: true }
  )

  // 11. Let handleFetchDone given response response be to finalize and
  // report timing with response, globalObject, and "fetch".
  const handleFetchDone = (response) =>
    finalizeAndReportTiming(response, 'fetch')

  // 12. Fetch request with processResponseDone set to handleFetchDone,
  // and processResponse given response being these substeps:
  const processResponse = (response) => {
    // 1. If locallyAborted is true, terminate these substeps.
    if (locallyAborted) {
      return
    }

    // 2. If response’s aborted flag is set, then abort fetch with p,
    // request, and responseObject, and terminate these substeps.
    if (response.aborted) {
      abortFetch.call(context, p, request, responseObject)
      return
    }

    // 3. If response is a network error, then reject p with a TypeError
    // and terminate these substeps.
    if (response.status === 0) {
      const error = new TypeError('fetch failed')
      error.cause = response.error
      p.reject(error)
      return
    }

    // 4. Set responseObject to the result of creating a Response object,
    // given response, "immutable", and relevantRealm.
    // TODO: relevantRealm
    responseObject = new Response()
    responseObject[kState] = response
    responseObject[kHeaders][kHeadersList] = response.headersList
    responseObject[kHeaders][kGuard] = 'immutable'

    // 5. Resolve p with responseObject.
    p.resolve(responseObject)
  }

  fetching.call(context, {
    request,
    processResponseDone: handleFetchDone,
    processResponse
  })

  // 13. Return p.
  return p.promise
}

function finalizeAndReportTiming (response, initiatorType = 'other') {
  // TODO
}

// https://fetch.spec.whatwg.org/#abort-fetch
function abortFetch (p, request, responseObject) {
  const context = this

  // 1. Let error be an "AbortError" DOMException.
  const error = new AbortError()

  // 2. Reject promise with error.
  p.reject(error)

  // 3. If request’s body is not null and is readable, then cancel request’s
  // body with error.
  if (request.body !== null && isBodyReadable(request.body)) {
    request.body.stream.cancel(error)
  }

  // 4. If responseObject is null, then return.
  if (responseObject == null) {
    return
  }

  // 5. Let response be responseObject’s response.
  const response = responseObject[kState]

  // 6. If response’s body is not null and is readable, then error response’s
  // body with error.
  if (response.body != null && isBodyReadable(response.body)) {
    context.controller.error(error)
  }
}

// https://fetch.spec.whatwg.org/#fetching
function fetching ({ request, processResponse, processResponseDone }) {
  // 1. Let taskDestination be null.
  // TODO

  // 2. Let crossOriginIsolatedCapability be false.
  // TODO

  // 3. If request’s client is non-null, then:
  // TODO

  // 4. If useParallelQueue is true, then set taskDestination to the result of
  // starting a new parallel queue.
  // TODO

  // 5. Let timingInfo be a new fetch timing info whose start time and
  // post-redirect start time are the coarsened shared current time given
  // crossOriginIsolatedCapability.
  // TODO: Coarsened shared current time given crossOriginIsolatedCapability?
  const currenTime = performance.now()
  const timingInfo = {
    startTime: currenTime,
    redirectStartTime: 0,
    redirectEndTime: 0,
    postRedirectStartTime: currenTime,
    finalServiceWorkerStartTime: 0,
    finalNetworkResponseStartTime: 0,
    finalNetworkRequestStartTime: 0,
    endTime: 0,
    encodedBodySize: 0,
    decodedBodySize: 0,
    finalConnectionTimingInfo: null
  }

  // 6. Let fetchParams be a new fetch params whose request is request, timing
  // info is timingInfo, process request body is processRequestBody,
  // process request end-of-body is processRequestEndOfBody, process response
  // is processResponse, process response end-of-body is
  // processResponseEndOfBody, process response done is processResponseDone,
  // task destination is taskDestination, and cross-origin isolated capability
  // is crossOriginIsolatedCapability.
  const fetchParams = {
    request,
    timingInfo,
    processRequestBody: null,
    processRequestEndOfBody: null,
    processResponse,
    processResponseEndOfBody: null,
    processResponseDone
  }

  // 7. If request’s body is a byte sequence, then set request’s body to the
  // first return value of safely extracting request’s body.
  // TODO

  // 8. If request’s window is "client", then set request’s window to request’s
  // client, if request’s client’s global object is a Window object; otherwise
  // "no-window".
  // TODO

  // 9. If request’s origin is "client", then set request’s origin to request’s
  // client’s origin.
  if (request.origin === 'client') {
    // TODO: What is correct here?
    request.origin = requestCurrentURL(request).origin
  }

  // 10. If request’s policy container is "client", then:
  if (request.policyContainer === 'client') {
    // TODO
  }

  // 11. If request’s header list does not contain `Accept`, then:
  if (!request.headersList.has('accept')) {
    // 1. Let value be `*/*`.
    const value = '*/*'

    // 2. A user agent should set value to the first matching statement, if
    // any, switching on request’s destination:
    // "document"
    // "frame"
    // "iframe"
    // `text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8`
    // "image"
    // `image/png,image/svg+xml,image/*;q=0.8,*/*;q=0.5`
    // "style"
    // `text/css,*/*;q=0.1`
    // TODO

    // 3. Append `Accept`/value to request’s header list.
    request.headersList.append('accept', value)

    // 12. If request’s header list does not contain `Accept-Language`, then
    // user agents should append `Accept-Language`/an appropriate value to
    // request’s header list.
    if (!request.headersList.has('accept-language')) {
      request.headersList.append('accept-language', '*')
    }
  }

  // 13. If request’s priority is null, then use request’s initiator and
  // destination appropriately in setting request’s priority to a
  // user-agent-defined object.
  // TODO

  // 14. If request is a subresource request, then:
  // TODO

  // 15. Run main fetch given fetchParams.
  mainFetch.call(this, fetchParams)
}

// https://fetch.spec.whatwg.org/#concept-main-fetch
async function mainFetch (fetchParams, recursive = false) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. If request’s local-URLs-only flag is set and request’s current URL is
  //  not local, then set response to a network error.
  if (
    request.localURLsOnly &&
    !/^(about|blob|data):/.test(requestCurrentURL(request).protocol)
  ) {
    return makeNetworkError('local URLs only')
  }

  // 4. Run report Content Security Policy violations for request.
  // TODO

  // 5. Upgrade request to a potentially trustworthy URL, if appropriate.
  // TODO

  // 6. If should request be blocked due to a bad port, should fetching request
  // be blocked as mixed content, or should request be blocked by Content
  // Security Policy returns blocked, then set response to a network error.
  if (requestBadPort(request) === 'blocked') {
    return makeNetworkError('bad port')
  }
  // TODO: should fetching request be blocked as mixed content?
  // TODO: should request be blocked by Content Security Policy?

  // 7. If request’s referrer policy is the empty string, then set request’s
  // referrer policy to request’s policy container’s referrer policy.
  if (request.referrerPolicy === '') {
    // TODO
  }

  // 8. If request’s referrer is not "no-referrer", then set request’s
  // referrer to the result of invoking determine request’s referrer.
  if (request.referrer !== 'no-referrer') {
    // TODO
  }

  // 9. Set request’s current URL’s scheme to "https" if all of the following
  // conditions are true:
  // - request’s current URL’s scheme is "http"
  // - request’s current URL’s host is a domain
  // - Matching request’s current URL’s host per Known HSTS Host Domain Name
  //   Matching results in either a superdomain match with an asserted
  //   includeSubDomains directive or a congruent match (with or without an
  //   asserted includeSubDomains directive). [HSTS]
  // TODO

  // 10. If recursive is false, then run the remaining steps in parallel.
  // TODO

  // 11. If response is null, then set response to the result of running
  // the steps corresponding to the first matching statement:
  // TODO
  response = await (async () => {
    // - request’s current URL’s origin is same origin with request’s origin,
    // and request’s response tainting is "basic"
    // - request’s current URL’s scheme is "data"
    // - request’s mode is "navigate" or "websocket"
    //    1. Set request’s response tainting to "basic".
    //    2. Return the result of running scheme fetch given fetchParams.
    // TODO

    // request’s mode is "same-origin"
    if (request.mode === 'same-origin') {
      // 1. Return a network error.
      return makeNetworkError('request mode cannot be "same-origin"')
    }

    // request’s mode is "no-cors"
    if (request.mode === 'no-cors') {
      // 1. If request’s redirect mode is not "follow", then return a network
      // error.
      if (request.redirect !== 'follow') {
        return makeNetworkError(
          'redirect cmode cannot be "follow" for "no-cors" request'
        )
      }

      // 2. Set request’s response tainting to "opaque".
      request.responseTainting = 'opaque'

      // 3. Let noCorsResponse be the result of running scheme fetch given
      // fetchParams.
      // TODO

      // 4. If noCorsResponse is a filtered response or the CORB check with
      // request and noCorsResponse returns allowed, then return noCorsResponse.
      // TODO

      // 5. Return a new response whose status is noCorsResponse’s status.
      // TODO
    }

    // request’s current URL’s scheme is not an HTTP(S) scheme
    if (!/^https?:/.test(requestCurrentURL(request).protocol)) {
      // Return a network error.
      return makeNetworkError('URL scheme must be a HTTP(S) scheme')
    }

    // - request’s use-CORS-preflight flag is set
    // - request’s unsafe-request flag is set and either request’s method is
    //   not a CORS-safelisted method or CORS-unsafe request-header names with
    //   request’s header list is not empty
    //    1. Set request’s response tainting to "cors".
    //    2. Let corsWithPreflightResponse be the result of running HTTP fetch
    //    given fetchParams and true.
    //    3. If corsWithPreflightResponse is a network error, then clear cache
    //    entries using request.
    //    4. Return corsWithPreflightResponse.
    // TODO

    // Otherwise
    //    1. Set request’s response tainting to "cors".
    request.responseTainting = 'cors'

    //    2. Return the result of running HTTP fetch given fetchParams.
    return await httpFetch
      .call(this, fetchParams)
      .catch((err) => makeNetworkError(err))
  })()

  // 12. If recursive is true, then return response.
  if (recursive) {
    return response
  }

  // 13. If response is not a network error and response is not a filtered
  // response, then:
  if (response.status !== 0 && !response.internalResponse) {
    // If request’s response tainting is "cors", then:
    if (request.responseTainting === 'cors') {
      // 1. Let headerNames be the result of extracting header list values
      // given `Access-Control-Expose-Headers` and response’s header list.
      // TODO
      // 2. If request’s credentials mode is not "include" and headerNames
      // contains `*`, then set response’s CORS-exposed header-name list to
      // all unique header names in response’s header list.
      // TODO
      // 3. Otherwise, if headerNames is not null or failure, then set
      // response’s CORS-exposed header-name list to headerNames.
      // TODO
    }

    // Set response to the following filtered response with response as its
    // internal response, depending on request’s response tainting:
    if (request.responseTainting === 'basic') {
      response = filterResponse(response, 'basic')
    } else if (request.responseTainting === 'cors') {
      response = filterResponse(response, 'cors')
    } else if (request.responseTainting === 'opaque') {
      response = filterResponse(response, 'opaque')
    } else {
      assert(false)
    }
  }

  // 14. Let internalResponse be response, if response is a network error,
  // and response’s internal response otherwise.
  let internalResponse =
    response.status === 0 ? response : response.internalResponse

  // 15. If internalResponse’s URL list is empty, then set it to a clone of
  // request’s URL list.
  if (internalResponse.urlList.length === 0) {
    internalResponse.urlList.push(...request.urlList)
  }

  // 16. If request’s timing allow failed flag is unset, then set
  // internalResponse’s timing allow passed flag.
  if (!request.timingAllowFailed) {
    response.timingAllowPassed = true
  }

  // 17. If response is not a network error and any of the following returns
  // blocked
  // - should internalResponse to request be blocked as mixed content
  // - should internalResponse to request be blocked by Content Security Policy
  // - should internalResponse to request be blocked due to its MIME type
  // - should internalResponse to request be blocked due to nosniff
  // TODO

  // 18. If response’s type is "opaque", internalResponse’s status is 206,
  // internalResponse’s range-requested flag is set, and request’s header
  // list does not contain `Range`, then set response and internalResponse
  // to a network error.
  if (
    response.type === 'opaque' &&
    internalResponse.status === 206 &&
    internalResponse.rangeRequested &&
    !request.headers.has('range')
  ) {
    response = internalResponse = makeNetworkError()
  }

  // 19. If response is not a network error and either request’s method is
  // `HEAD` or `CONNECT`, or internalResponse’s status is a null body status,
  // set internalResponse’s body to null and disregard any enqueuing toward
  // it (if any).
  if (
    response.status !== 0 &&
    (request.method === 'HEAD' ||
      request.method === 'CONNECT' ||
      nullBodyStatus.includes(internalResponse.status))
  ) {
    internalResponse.body = null
    if (context.abort) {
      context.abort()
    }
  }

  // 20. If request’s integrity metadata is not the empty string, then:
  if (request.integrity) {
    // 1. Let processBodyError be this step: run fetch finale given fetchParams
    // and a network error.
    const processBodyError = (reason) =>
      fetchFinale(fetchParams, makeNetworkError(reason))

    // 2. If request’s response tainting is "opaque", response is a network
    // error, or response’s body is null, then run processBodyError and abort
    // these steps.
    if (request.responseTainting === 'opaque' && response.status === 0) {
      processBodyError(response.error)
      return
    }

    // 3. Let processBody given bytes be these steps:
    const processBody = (bytes) => {
      // 1. If bytes do not match request’s integrity metadata,
      // then run processBodyError and abort these steps. [SRI]
      // TODO

      // 2. Set response’s body to the first return value of safely
      // extracting bytes.
      response.body = safelyExtractBody(bytes)[0]

      // 3. Run fetch finale given fetchParams and response.
      fetchFinale(fetchParams, response)
    }

    // 4. Fully read response’s body given processBody and processBodyError.
    try {
      processBody(await response.arrayBuffer())
    } catch (err) {
      processBodyError(err)
    }
  } else {
    // 21. Otherwise, run fetch finale given fetchParams and response.
    fetchFinale(fetchParams, response)
  }
}

// https://fetch.spec.whatwg.org/#finalize-response
function finalizeResponse (fetchParams, response) {
  // 1. Set fetchParams’s request’s done flag.
  fetchParams.request.done = true

  // 2, If fetchParams’s process response done is not null, then queue a fetch
  // task to run fetchParams’s process response done given response, with
  // fetchParams’s task destination.
  if (fetchParams.processResponseDone) {
    fetchParams.processResponseDone(response)
  }
}

// https://fetch.spec.whatwg.org/#fetch-finale
function fetchFinale (fetchParams, response) {
  // 1. If fetchParams’s process response is non-null,
  // then queue a fetch task to run fetchParams’s process response
  // given response, with fetchParams’s task destination.
  if (fetchParams.processResponse !== null) {
    fetchParams.processResponse(response)
  }

  // 2. If fetchParams’s process response end-of-body is non-null, then:.
  //    TODO
  //    1. Let processBody given nullOrBytes be this step: run fetchParams’s
  //    process response end-of-body given response and nullOrBytes.on.
  //    TODO
  //    2. Let processBodyError be this step: run fetchParams’s process
  //    response end-of-body given response and failure.on.
  //    TODO
  //    3. If response’s body is null, then queue a fetch task to run
  //    processBody given null, with fetchParams’s task destination.on.
  //    TODO
  //    4. Otherwise, fully read response’s body given processBody,
  //    processBodyError, and fetchParams’s task destination.on.
  //    TODO
}

// https://fetch.spec.whatwg.org/#http-fetch
async function httpFetch (fetchParams) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. Let actualResponse be null.
  let actualResponse = null

  // 4. Let timingInfo be fetchParams’s timing info.
  const timingInfo = fetchParams.timingInfo

  // 5. If request’s service-workers mode is "all", then:
  // TODO

  // 6. If response is null, then:
  if (response === null) {
    // 1. If makeCORSPreflight is true and one of these conditions is true:
    // TODO

    // 2. If request’s redirect mode is "follow", then set request’s
    // service-workers mode to "none".
    if (request.redirect === 'follow') {
      request.serviceWorkers = 'none'
    }

    // 3. Set response and actualResponse to the result of running
    // HTTP-network-or-cache fetch given fetchParams.
    actualResponse = response = await httpNetworkOrCacheFetch.call(
      this,
      fetchParams
    )

    // 4. If request’s response tainting is "cors" and a CORS check
    // for request and response returns failure, then return a network error.
    // TODO

    // 5. If the TAO check for request and response returns failure, then set
    // request’s timing allow failed flag.
    // TODO
  }

  // 7. If either request’s response tainting or response’s type
  // is "opaque", and the cross-origin resource policy check with
  // request’s origin, request’s client, request’s destination,
  // and actualResponse returns blocked, then return a network error.
  // TODO

  // 8. If actualResponse’s status is a redirect status, then:
  if (redirectStatus.includes(actualResponse.status)) {
    // 1. If actualResponse’s status is not 303, request’s body is not null,
    // and the connection uses HTTP/2, then user agents may, and are even
    // encouraged to, transmit an RST_STREAM frame.
    // See, https://github.com/whatwg/fetch/issues/1288
    if (context.abort) {
      context.abort()
    }

    // 2. Switch on request’s redirect mode:
    if (request.redirect === 'error') {
      // Set response to a network error.
      response = makeNetworkError()
    } else if (request.redirect === 'manual') {
      // Set response to an opaque-redirect filtered response whose internal
      // response is actualResponse.
      response = filterResponse(response, 'opaqueredirect')
    } else if (request.redirect === 'follow') {
      // Set response to the result of running HTTP-redirect fetch given
      // fetchParams and response.
      response = await httpRedirectFetch.call(this, fetchParams, response)
    } else {
      assert(false)
    }
  }

  // 9. Set response’s timing info to timingInfo.
  response.timingInfo = timingInfo

  // 10. Return response.
  return response
}

// https://fetch.spec.whatwg.org/#http-redirect-fetch
async function httpRedirectFetch (fetchParams, response) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let actualResponse be response, if response is not a filtered response,
  // and response’s internal response otherwise.
  const actualResponse = response.internalResponse
    ? response.internalResponse
    : response

  // 3. Let locationURL be actualResponse’s location URL given request’s current
  // URL’s fragment.
  let locationURL

  try {
    locationURL = responseLocationURL(
      actualResponse,
      requestCurrentURL(request).hash
    )

    // 4. If locationURL is null, then return response.
    if (locationURL == null) {
      return response
    }
  } catch (err) {
    // 5. If locationURL is failure, then return a network error.
    return makeNetworkError(err)
  }

  // 6. If locationURL’s scheme is not an HTTP(S) scheme, then return a network
  // error.
  if (!/^https?:/.test(locationURL)) {
    return makeNetworkError('URL scheme must be a HTTP(S) scheme')
  }

  // 7. If request’s redirect count is twenty, return a network error.
  if (request.redirectCount === 20) {
    return makeNetworkError('redirect count exceeded')
  }

  // 8. Increase request’s redirect count by one.
  request.redirectCount += 1

  // 9. If request’s mode is "cors", locationURL includes credentials, and
  // request’s origin is not same origin with locationURL’s origin, then return
  //  a network error.
  if (request.mode === 'cors' && request.origin !== locationURL.origin) {
    return makeNetworkError('cross origin not allowed for request mode "cors"')
  }

  // 10. If request’s response tainting is "cors" and locationURL includes
  // credentials, then return a network error.
  if (
    request.responseTainting === 'cors' &&
    (locationURL.username || locationURL.password)
  ) {
    return makeNetworkError(
      'URL cannot contain credentials for request mode "cors"'
    )
  }

  // 11. If actualResponse’s status is not 303, request’s body is non-null,
  // and request’s body’s source is null, then return a network error.
  if (
    actualResponse.status !== 303 &&
    request.body !== null &&
    request.body.source == null
  ) {
    return makeNetworkError()
  }

  // 12. If locationURL’s origin is not same origin with request’s current URL’s
  // origin and request’s origin is not same origin with request’s current
  // URL’s origin, then set request’s tainted origin flag.
  if (
    locationURL.origin !== requestCurrentURL(request).origin &&
    request.origin !== locationURL.origin
  ) {
    request.taintedOrigin = true
  }

  // 13. If one of the following is true
  // - actualResponse’s status is 301 or 302 and request’s method is `POST`
  // - actualResponse’s status is 303 and request’s method is not `GET` or `HEAD`
  if (
    ([301, 302].includes(actualResponse.status) && request.method === 'POST') ||
    (actualResponse.status === 303 &&
      !['GET', 'HEADER'].includes(request.method))
  ) {
    // then:
    // 1. Set request’s method to `GET` and request’s body to null.
    request.method = 'GET'
    request.body = null

    // 2. For each headerName of request-body-header name, delete headerName from
    //    request’s header list.
    for (const headerName of requestBodyHeader) {
      request.headersList.delete(headerName)
    }
  }

  // 14. If request’s body is non-null, then set request’s body to the first return
  // value of safely extracting request’s body’s source.
  if (request.body !== null) {
    assert(request.body.source)
    request.body = safelyExtractBody(request.body.source)[0]
  }

  // 15. Let timingInfo be fetchParams’s timing info.
  const timingInfo = fetchParams.timingInfo

  // 16. Set timingInfo’s redirect end time and post-redirect start time to the
  // coarsened shared current time given fetchParams’s cross-origin isolated capability.
  // TODO: given fetchParams’s cross-origin isolated capability?
  timingInfo.redirectEndTime = timingInfo.postRedirectStartTime =
    performance.now()

  // 17. If timingInfo’s redirect start time is 0, then set timingInfo’s redirect start
  // time to timingInfo’s start time.
  if (timingInfo.redirectStartTime === 0) {
    timingInfo.redirectStartTime = timingInfo.startTime
  }

  // 18. Append locationURL to request’s URL list.
  request.urlList.push(locationURL)

  // 19. Invoke set request’s referrer policy on redirect on request and actualResponse.
  // TODO

  // 20. Return the result of running main fetch given fetchParams and true.
  return mainFetch.call(this, fetchParams, true)
}

// https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
async function httpNetworkOrCacheFetch (
  fetchParams,
  isAuthenticationFetch = false,
  isNewConnectionFetch = false
) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let httpFetchParams be null.
  let httpFetchParams = null

  // 3. Let httpRequest be null.
  let httpRequest = null

  // 4. Let response be null.
  let response = null

  // 5. Let storedResponse be null.
  // TODO

  // 6. Let httpCache be null.
  const httpCache = null

  // 7. Let the revalidatingFlag be unset.
  const revalidatingFlag = false

  // 8. Run these steps, but abort when the ongoing fetch is terminated:

  //    1. If request’s window is "no-window" and request’s redirect mode is
  //    "error", then set httpFetchParams to fetchParams and httpRequest to
  //    request.
  if (request.window === 'no-window' && request.redirect === 'error') {
    httpFetchParams = fetchParams
    httpRequest = request
  } else {
    // Otherwise:

    // 1. Set httpRequest to a clone of request.
    httpRequest = makeRequest(request)

    // 2. Set httpFetchParams to a copy of fetchParams.
    httpFetchParams = { ...fetchParams }

    // 3. Set httpFetchParams’s request to httpRequest.
    httpFetchParams.request = httpRequest
  }

  //    3. Let includeCredentials be true if one of
  const includeCredentials =
    request.credentials === 'include' ||
    (request.credentials === 'same-origin' &&
      request.responseTainting === 'basic')

  //    4. Let contentLength be httpRequest’s body’s length, if httpRequest’s
  //    body is non-null; otherwise null.
  const contentLength = httpRequest.body ? httpRequest.body.length : null

  //    5. Let contentLengthHeaderValue be null.
  let contentLengthHeaderValue = null

  //    6. If httpRequest’s body is null and httpRequest’s method is `POST` or
  //    `PUT`, then set contentLengthHeaderValue to `0`.
  if (
    httpRequest.body == null &&
    ['POST', 'PUT'].includes(httpRequest.method)
  ) {
    contentLengthHeaderValue = '0'
  }

  //    7. If contentLength is non-null, then set contentLengthHeaderValue to
  //    contentLength, serialized and isomorphic encoded.
  if (contentLength !== null) {
    // TODO: isomorphic encoded
    contentLengthHeaderValue = String(contentLength)
  }

  //    8. If contentLengthHeaderValue is non-null, then append
  //    `Content-Length`/contentLengthHeaderValue to httpRequest’s header
  //    list.
  if (contentLengthHeaderValue !== null) {
    httpRequest.headersList.append('content-length', contentLengthHeaderValue)
  }

  //    9. If contentLength is non-null and httpRequest’s keepalive is true,
  //    then:
  if (contentLength !== null && httpRequest.keepalive) {
    // NOTE: keepalive is a noop outside of browser context.
  }

  //    10 .If httpRequest’s referrer is a URL, then append
  //    `Referer`/httpRequest’s referrer, serialized and isomorphic encoded,
  //     to httpRequest’s header list.
  if (httpRequest.referrer instanceof URL) {
    // TODO: isomorphic encoded
    httpRequest.headersList.append('referer', httpRequest.referrer.href)
  }

  //    11. Append a request `Origin` header for httpRequest.
  //    TODO

  //    12. Append the Fetch metadata headers for httpRequest. [FETCH-METADATA]

  //      https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-dest-header
  //      TODO

  //      https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-mode-header
  {
    //      1. Assert: r’s url is a potentially trustworthy URL.
    //      TODO

    //      2. Let header be a Structured Header whose value is a token.
    let header = null

    //      3. Set header’s value to r’s mode.
    header = request.mode

    //      4. Set a structured field value `Sec-Fetch-Mode`/header in r’s header list.
    httpRequest.headersList.append('sec-fetch-mode', header)
  }

  //    https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-site-header
  //    TODO

  //    https://w3c.github.io/webappsec-fetch-metadata/#sec-fetch-user-header
  //    TODO

  //    13. If httpRequest’s header list does not contain `User-Agent`, then
  //    user agents should append `User-Agent`/default `User-Agent` value to
  //    httpRequest’s header list.
  if (!httpRequest.headersList.has('user-agent')) {
    httpRequest.headersList.append('user-agent', 'undici')
  }

  //    14. If httpRequest’s cache mode is "default" and httpRequest’s header
  //    list contains `If-Modified-Since`, `If-None-Match`,
  //    `If-Unmodified-Since`, `If-Match`, or `If-Range`, then set
  //    httpRequest’s cache mode to "no-store".
  if (
    httpRequest.cache === 'default' &&
    (httpRequest.headersList.has('if-modified-since') ||
      httpRequest.headersList.has('if-none-match') ||
      httpRequest.headersList.has('if-unmodified-since') ||
      httpRequest.headersList.has('if-match') ||
      httpRequest.headersList.has('if-range'))
  ) {
    httpRequest.cache = 'no-store'
  }

  //    15. If httpRequest’s cache mode is "no-cache", httpRequest’s prevent
  //    no-cache cache-control header modification flag is unset, and
  //    httpRequest’s header list does not contain `Cache-Control`, then append
  //    `Cache-Control`/`max-age=0` to httpRequest’s header list.
  if (
    httpRequest.cache === 'no-cache' &&
    !httpRequest.preventNoCacheCacheControlHeaderModification &&
    !httpRequest.headersList.has('cache-control')
  ) {
    httpRequest.headersList.append('cache-control', 'max-age=0')
  }

  //    16. If httpRequest’s cache mode is "no-store" or "reload", then:
  if (httpRequest.cache === 'no-store' || httpRequest.cache === 'reload') {
    // 1. If httpRequest’s header list does not contain `Pragma`, then append
    // `Pragma`/`no-cache` to httpRequest’s header list.
    if (!httpRequest.headersList.has('pragma')) {
      httpRequest.headersList.append('pragma', 'no-cache')
    }

    // 2. If httpRequest’s header list does not contain `Cache-Control`,
    // then append `Cache-Control`/`no-cache` to httpRequest’s header list.
    if (!httpRequest.headersList.has('cache-control')) {
      httpRequest.headersList.append('cache-control', 'no-cache')
    }
  }

  //    17. If httpRequest’s header list contains `Range`, then append
  //    `Accept-Encoding`/`identity` to httpRequest’s header list.
  if (httpRequest.headersList.has('range')) {
    httpRequest.headersList.append('accept-encoding', 'identity')
  }

  //    18. Modify httpRequest’s header list per HTTP. Do not append a given
  //    header if httpRequest’s header list contains that header’s name.
  //    TODO: https://github.com/whatwg/fetch/issues/1285#issuecomment-896560129

  //    19. If includeCredentials is true, then:
  if (includeCredentials) {
    // 1. If the user agent is not configured to block cookies for httpRequest
    // (see section 7 of [COOKIES]), then:
    // TODO
    // 2. If httpRequest’s header list does not contain `Authorization`, then:
    // TODO
  }

  //    20. If there’s a proxy-authentication entry, use it as appropriate.
  //    TODO

  //    21. Set httpCache to the result of determining the HTTP cache
  //    partition, given httpRequest.
  //    TODO

  //    22. If httpCache is null, then set httpRequest’s cache mode to
  //    "no-store".
  if (httpCache == null) {
    httpRequest.cache = 'no-store'
  }

  //    23. If httpRequest’s cache mode is neither "no-store" nor "reload",
  //    then:
  if (httpRequest.mode !== 'no-store' && httpRequest.mode !== 'reload') {
    // TODO
  }

  // 9. If aborted, then:
  // TODO

  // 10. If response is null, then:
  if (response == null) {
    // 1. If httpRequest’s cache mode is "only-if-cached", then return a
    // network error.
    if (httpRequest.mode === 'only-if-cached') {
      return makeNetworkError('only if cached')
    }

    // 2. Let forwardResponse be the result of running HTTP-network fetch
    // given httpFetchParams, includeCredentials, and isNewConnectionFetch.
    const forwardResponse = await httpNetworkFetch.call(
      this,
      httpFetchParams,
      includeCredentials,
      isNewConnectionFetch
    )

    // 3. If httpRequest’s method is unsafe and forwardResponse’s status is
    // in the range 200 to 399, inclusive, invalidate appropriate stored
    // responses in httpCache, as per the "Invalidation" chapter of HTTP
    // Caching, and set storedResponse to null. [HTTP-CACHING]
    if (
      !safeMethods.includes(httpRequest.method) &&
      forwardResponse.status >= 200 &&
      forwardResponse.status <= 399
    ) {
      // TODO
    }

    // 4. If the revalidatingFlag is set and forwardResponse’s status is 304,
    // then:
    if (revalidatingFlag && forwardResponse.status === 304) {
      // TODO
    }

    // 5. If response is null, then:
    if (response == null) {
      // 1. Set response to forwardResponse.
      response = forwardResponse

      // 2. Store httpRequest and forwardResponse in httpCache, as per the
      // "Storing Responses in Caches" chapter of HTTP Caching. [HTTP-CACHING]
      // TODO
    }
  }

  // 11. Set response’s URL list to a clone of httpRequest’s URL list.
  response.urlList = [...httpRequest.urlList]

  // 12. If httpRequest’s header list contains `Range`, then set response’s
  // range-requested flag.
  if (httpRequest.headersList.has('range')) {
    response.rangeRequested = true
  }

  // 13. If response’s status is 401, httpRequest’s response tainting is not
  // "cors", includeCredentials is true, and request’s window is an environment
  // settings object, then:
  // TODO

  // 14. If response’s status is 407, then:
  if (response.status === 407) {
    // 1. If request’s window is "no-window", then return a network error.
    if (request.window === 'no-window') {
      return makeNetworkError()
    }

    // 2. ???

    // 3. If the ongoing fetch is terminated, then:
    if (context.terminated) {
      // 1. Let aborted be the termination’s aborted flag.
      // 2. If aborted is set, then return an aborted network error.
      // 3. Return a network error.
      return makeNetworkError(
        context.terminated.aborted ? new AbortError() : null
      )
    }

    // 4. Prompt the end user as appropriate in request’s window and store
    // the result as a proxy-authentication entry. [HTTP-AUTH]
    // TODO: Invoke some kind of callback?
    return makeNetworkError('proxy authentication required')

    // 5. Set response to the result of running HTTP-network-or-cache fetch given
    // fetchParams.
    // TODO
  }

  // 15. If all of the following are true
  if (
    // response’s status is 421
    response.status === 421 &&
    // isNewConnectionFetch is false
    !isNewConnectionFetch &&
    // request’s body is null, or request’s body is non-null and request’s body’s source is non-null
    (request.body == null || request.body.source !== null)
  ) {
    // 1. If the ongoing fetch is terminated, then:
    if (context.terminated) {
      // 1. Let aborted be the termination’s aborted flag.
      const aborted = context.terminated.aborted

      // 2. If aborted is set, then return an aborted network error.
      const reason = aborted ? new AbortError() : new Error('terminated')

      // 3. Return a network error.
      return makeNetworkError(reason)
    }

    response = await httpNetworkOrCacheFetch.call(
      this,
      fetchParams,
      isAuthenticationFetch,
      true
    )
  }

  // 16. If isAuthenticationFetch is true, then create an authentication entry
  // for request and the given realm.
  if (isAuthenticationFetch) {
    // TODO
  }

  // 17. Return response.
  return response
}

// https://fetch.spec.whatwg.org/#http-network-fetch
function httpNetworkFetch (
  fetchParams,
  includeCredentials = false,
  forceNewConnection = false
) {
  // 1. Let request be fetchParams’s request.
  const request = fetchParams.request

  // 2. Let response be null.
  let response = null

  // 3. Let timingInfo be fetchParams’s timing info.
  // TODO

  // 4. Let httpCache be the result of determining the HTTP cache partition,
  // given request.
  // TODO
  const httpCache = null

  // 5. If httpCache is null, then set request’s cache mode to "no-store".
  if (httpCache == null) {
    request.cache = 'no-store'
  }

  // 6. Let networkPartitionKey be the result of determining the network
  // partition key given request.
  // TODO

  // ...

  const context = this

  // TODO: forceNewConnection

  // NOTE: This is just a hack.
  if (forceNewConnection && context.controller) {
    context.abort()
  }

  assert(!context.controller)

  const url = requestCurrentURL(request)
  return new Promise((resolve) =>
    context.dispatcher.dispatch(
      {
        path: url.pathname + url.search,
        origin: url.origin,
        method: request.method,
        body: request.body ? request.body.stream : request.body,
        headers: request.headersList,
        maxRedirections: 0
      },
      {
        onConnect (abort) {
          if (context.terminated) {
            abort(new AbortError())
          } else {
            context.abort = (err) => abort(err ?? new AbortError())
          }
        },

        onHeaders (status, headersList, resume, statusText) {
          if (status < 200) {
            return
          }

          const headers = new Headers()
          for (let n = 0; n < headersList.length; n += 2) {
            headers.append(
              headersList[n + 0].toString(),
              headersList[n + 1].toString()
            )
          }

          const stream =
            status === 204
              ? null
              : new ReadableStream(
                {
                  async start (controller) {
                    context.controller = controller
                  },
                  async pull () {
                    resume()
                  },
                  async cancel (reason) {
                    let err
                    if (reason instanceof Error) {
                      err = reason
                    } else if (typeof reason === 'string') {
                      err = new Error(reason)
                    } else {
                      err = new AbortError()
                    }

                    context.abort(err)
                  }
                },
                { highWaterMark: 16384 }
              )

          response = makeResponse({
            status,
            statusText,
            headersList: headers[kHeadersList],
            body: stream ? { stream } : null
          })

          resolve(response)

          return false
        },

        onData (chunk) {
          assert(context.controller)

          // Copy the Buffer to detach it from Buffer pool.
          // TODO: Is this required?
          chunk = new Uint8Array(chunk)

          context.controller.enqueue(chunk)

          return context.controller.desiredSize > 0
        },

        onComplete () {
          assert(context.controller)

          context.controller.close()
          context.controller = null
          context.abort = null

          finalizeResponse(fetchParams, response)
        },

        onError (err) {
          if (context.controller) {
            context.controller.error(err)
            context.controller = null
            context.abort = null
          } else {
            // TODO: What if 204?
            resolve(makeNetworkError(err))
          }
        }
      }
    )
  )
}

function createDeferredPromise () {
  let res
  let rej
  const promise = new Promise((resolve, reject) => {
    res = resolve
    rej = reject
  })

  return { promise, resolve: res, reject: rej }
}

module.exports = fetch
