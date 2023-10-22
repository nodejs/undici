const { createDeferredPromise, coarsenedSharedCurrentTime, createOpaqueTimingInfo, urlIsHttpHttpsScheme } = require('../util')
const { Request } = require('../request')
const { kState, kRealm, kHeaders, kGuard } = require('../symbols')
const { addAbortListener, isReadable, nodeMajor, nodeMinor } = require('../../core/util')
const assert = require('assert')
const { Response } = require('../response')
const { kHeadersList } = require('../../core/symbols')
const { getGlobalDispatcher } = require('../../global')
const { fetching } = require('./fetching')
const { DOMException } = require('../constants')

class FetchInstance {
  constructor (input, init) {
    this.input = input
    this.init = init

    // 1. Let p be a new promise.
    this.p = createDeferredPromise()

    // 7. Let responseObject be null.
    this.responseObject = null

    // 8. Let relevantRealm be this’s relevant Realm.
    this.relevantRealm = null

    // 9. Let locallyAborted be false.
    this.locallyAborted = false

    // 10. Let controller be null.
    this.controller = null
  }

  execute () {
    // 2. Let requestObject be the result of invoking the initial value of
    // Request as constructor with input and init as arguments. If this throws
    // an exception, reject p with it and return p.

    try {
      this.requestObject = new Request(this.input, this.init)
    } catch (e) {
      this.p.reject(e)
      return this.p.promise
    }

    // 3. Let request be requestObject’s request.
    this.request = this.requestObject[kState]

    // 4. If requestObject’s signal’s aborted flag is set, then:
    if (this.requestObject.signal.aborted) {
      // 1. Abort the fetch() call with p, request, null, and
      //    requestObject’s signal’s abort reason.
      abortFetch(this.p, this.request, null, this.requestObject.signal.reason)

      // 2. Return p.
      return this.p.promise
    }

    // 5. Let globalObject be request’s client’s global object.
    const globalObject = this.request.client.globalObject

    // 6. If globalObject is a ServiceWorkerGlobalScope object, then set
    // request’s service-workers mode to "none".
    if (globalObject?.constructor?.name === 'ServiceWorkerGlobalScope') {
      this.request.serviceWorkers = 'none'
    }

    // 11. Add the following abort steps to requestObject’s signal:
    addAbortListener(
      this.requestObject.signal,
      () => {
        // 1. Set locallyAborted to true.
        this.locallyAborted = true

        // 2. Assert: controller is non-null.
        assert(this.controller != null)

        // 3. Abort controller with requestObject’s signal’s abort reason.
        this.controller.abort(this.requestObject.signal.reason)

        // 4. Abort the fetch() call with p, request, responseObject,
        //    and requestObject’s signal’s abort reason.
        abortFetch(this.p, this.request, this.responseObject, this.requestObject.signal.reason)
      }
    )

    this.controller = fetching({
      request: this.request,
      processResponseEndOfBody: handleFetchDone,
      processResponse: (response) => { return this.#processResponse(response) },
      dispatcher: this.init.dispatcher ?? getGlobalDispatcher() // undici
    })

    // 14. Return p.
    return this.p.promise
  }

  // 13. Set controller to the result of calling fetch given request,
  // with processResponseEndOfBody set to handleFetchDone, and processResponse
  // given response being these substeps:

  #processResponse (response) {
    // 1. If locallyAborted is true, terminate these substeps.
    if (this.locallyAborted) {
      return
    }

    // 2. If response’s aborted flag is set, then:
    if (response.aborted) {
      // 1. Let deserializedError be the result of deserialize a serialized
      //    abort reason given controller’s serialized abort reason and
      //    relevantRealm.

      // 2. Abort the fetch() call with p, request, responseObject, and
      //    deserializedError.

      abortFetch(this.p, this.request, this.responseObject, this.controller.serializedAbortReason)
      return
    }

    // 3. If response is a network error, then reject p with a TypeError
    // and terminate these substeps.
    if (response.type === 'error') {
      this.p.reject(
        Object.assign(new TypeError('fetch failed'), { cause: response.error })
      )
      return
    }

    // 4. Set responseObject to the result of creating a Response object,
    // given response, "immutable", and relevantRealm.
    this.responseObject = new Response()
    this.responseObject[kState] = response
    this.responseObject[kRealm] = this.relevantRealm
    this.responseObject[kHeaders][kHeadersList] = response.headersList
    this.responseObject[kHeaders][kGuard] = 'immutable'
    this.responseObject[kHeaders][kRealm] = this.relevantRealm

    // 5. Resolve p with responseObject.
    this.p.resolve(this.responseObject)
  }
}

// https://fetch.spec.whatwg.org/#abort-fetch
function abortFetch (p, request, responseObject, error) {
  // Note: AbortSignal.reason was added in node v17.2.0
  // which would give us an undefined error to reject with.
  // Remove this once node v16 is no longer supported.
  if (!error) {
    error = new DOMException('The operation was aborted.', 'AbortError')
  }

  // 1. Reject promise with error.
  p.reject(error)

  // 2. If request’s body is not null and is readable, then cancel request’s
  // body with error.
  if (request.body != null && isReadable(request.body?.stream)) {
    request.body.stream.cancel(error).catch((err) => {
      if (err.code === 'ERR_INVALID_STATE') {
        // Node bug?
        return
      }
      throw err
    })
  }

  // 3. If responseObject is null, then return.
  if (responseObject == null) {
    return
  }

  // 4. Let response be responseObject’s response.
  const response = responseObject[kState]

  // 5. If response’s body is not null and is readable, then error response’s
  // body with error.
  if (response.body != null && isReadable(response.body?.stream)) {
    response.body.stream.cancel(error).catch((err) => {
      if (err.code === 'ERR_INVALID_STATE') {
        // Node bug?
        return
      }
      throw err
    })
  }
}

// https://fetch.spec.whatwg.org/#finalize-and-report-timing
function finalizeAndReportTiming (response, initiatorType = 'other') {
  // 1. If response is an aborted network error, then return.
  if (response.type === 'error' && response.aborted) {
    return
  }

  // 2. If response’s URL list is null or empty, then return.
  if (!response.urlList?.length) {
    return
  }

  // 3. Let originalURL be response’s URL list[0].
  const originalURL = response.urlList[0]

  // 4. Let timingInfo be response’s timing info.
  let timingInfo = response.timingInfo

  // 5. Let cacheState be response’s cache state.
  let cacheState = response.cacheState

  // 6. If originalURL’s scheme is not an HTTP(S) scheme, then return.
  if (!urlIsHttpHttpsScheme(originalURL)) {
    return
  }

  // 7. If timingInfo is null, then return.
  if (timingInfo === null) {
    return
  }

  // 8. If response’s timing allow passed flag is not set, then:
  if (!timingInfo.timingAllowPassed) {
    //  1. Set timingInfo to a the result of creating an opaque timing info for timingInfo.
    timingInfo = createOpaqueTimingInfo({
      startTime: timingInfo.startTime
    })

    //  2. Set cacheState to the empty string.
    cacheState = ''
  }

  // 9. Set timingInfo’s end time to the coarsened shared current time
  // given global’s relevant settings object’s cross-origin isolated
  // capability.
  // TODO: given global’s relevant settings object’s cross-origin isolated
  // capability?
  timingInfo.endTime = coarsenedSharedCurrentTime()

  // 10. Set response’s timing info to timingInfo.
  response.timingInfo = timingInfo

  // 11. Mark resource timing for timingInfo, originalURL, initiatorType,
  // global, and cacheState.
  markResourceTiming(
    timingInfo,
    originalURL,
    initiatorType,
    globalThis,
    cacheState
  )
}

// https://w3c.github.io/resource-timing/#dfn-mark-resource-timing
function markResourceTiming (timingInfo, originalURL, initiatorType, globalThis, cacheState) {
  if (nodeMajor > 18 || (nodeMajor === 18 && nodeMinor >= 2)) {
    performance.markResourceTiming(timingInfo, originalURL.href, initiatorType, globalThis, cacheState)
  }
}

// 12. Let handleFetchDone given response response be to finalize and
// report timing with response, globalObject, and "fetch".
function handleFetchDone (response) {
  finalizeAndReportTiming(response, 'fetch')
}

module.exports = {
  FetchInstance,
  finalizeAndReportTiming
}
