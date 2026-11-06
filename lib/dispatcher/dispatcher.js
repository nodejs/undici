'use strict'
const EventEmitter = require('node:events')
const { kOriginless, kUrl } = require('../core/symbols')
const diagnosticsChannel = require('../core/diagnostics')

const interceptorEnter = diagnosticsChannel.channels.interceptorEnter
const interceptorExit = diagnosticsChannel.channels.interceptorExit
const interceptorError = diagnosticsChannel.channels.interceptorError

function hasAnyInterceptorSubscriber () {
  return (
    interceptorEnter.hasSubscribers ||
    interceptorExit.hasSubscribers ||
    interceptorError.hasSubscribers
  )
}

// Serializable request id for a single interceptor hop. APM / tracing libs
// persist these; `${pid}-${counter}` is unique per Node process + each
// restart gets a fresh pid. The counter is monotonic within a process.
let interceptorRequestCounter = 0
function nextInterceptorRequestId () {
  return `${process.pid}-${++interceptorRequestCounter}`
}

function instrumentDispatchForInterceptor (dispatch, interceptorName) {
  return function instrumentedDispatch (opts, handler) {
    // Fast path: if nobody is listening, skip all wrapping. Mirrors the
    // zero-subscriber shape used by lib/interceptor/deduplicate.js:103.
    if (!hasAnyInterceptorSubscriber()) {
      return dispatch(opts, handler)
    }

    const requestId = nextInterceptorRequestId()
    const startTime = performance.now()
    const method = opts != null ? opts.method : undefined
    const origin = opts != null ? opts.origin : undefined
    const path = opts != null ? opts.path : undefined

    if (interceptorEnter.hasSubscribers) {
      interceptorEnter.publish({
        interceptor: interceptorName,
        requestId,
        method,
        origin,
        path,
        startTime
      })
    }

    const publishExit = () => {
      if (interceptorExit.hasSubscribers) {
        interceptorExit.publish({
          interceptor: interceptorName,
          requestId,
          method,
          origin,
          path,
          duration: performance.now() - startTime
        })
      }
    }

    const publishError = (err) => {
      if (interceptorError.hasSubscribers) {
        interceptorError.publish({
          interceptor: interceptorName,
          requestId,
          method,
          origin,
          path,
          duration: performance.now() - startTime,
          error: err
        })
      }
    }

    // Wrap the handler so we observe this interceptor's own view of
    // onResponseEnd / onResponseError. All other handler methods are
    // transparently forwarded via Proxy; bound methods are memoised in
    // boundCache so a dispatch that pumps many onResponseData chunks
    // only pays the bind cost once per handler property.
    //
    // Methods bind to the real target so handler classes that use
    // private fields (e.g. the fetch internal handler, RetryHandler)
    // keep working — a bare Proxy would make `this === proxy`, which
    // cannot access the target's `#` fields.
    const boundCache = Object.create(null)
    const diagnosticHandler = new Proxy(handler, {
      get (target, prop) {
        if (prop === 'onResponseEnd') {
          return function (...args) {
            // Publish exit AFTER the inner handler completes so the
            // reported duration includes the handler's own onResponseEnd
            // work (body-buffering, trailer parsing, user callbacks).
            try {
              return target.onResponseEnd != null
                ? target.onResponseEnd.apply(target, args)
                : undefined
            } finally {
              publishExit()
            }
          }
        }
        if (prop === 'onResponseError') {
          return function (controller, err) {
            publishError(err)
            return target.onResponseError != null
              ? target.onResponseError(controller, err)
              : undefined
          }
        }
        if (prop in boundCache) {
          return boundCache[prop]
        }
        const value = Reflect.get(target, prop, target)
        const result = typeof value === 'function' ? value.bind(target) : value
        boundCache[prop] = result
        return result
      }
    })

    try {
      return dispatch(opts, diagnosticHandler)
    } catch (err) {
      // Interceptor threw synchronously before reaching the handler.
      publishError(err)
      throw err
    }
  }
}

class Dispatcher extends EventEmitter {
  dispatch () {
    throw new Error('not implemented')
  }

  close () {
    throw new Error('not implemented')
  }

  destroy () {
    throw new Error('not implemented')
  }

  compose (...args) {
    // So we handle [interceptor1, interceptor2] or interceptor1, interceptor2, ...
    const interceptors = Array.isArray(args[0]) ? args[0] : args
    // null disables origin-dependent interceptors; undefined uses opts.origin.
    const interceptorOrigin = this[kOriginless] === true
      ? null
      : this[kUrl]?.origin
    let dispatch = this.dispatch.bind(this)

    for (const interceptor of interceptors) {
      if (interceptor == null) {
        continue
      }

      if (typeof interceptor !== 'function') {
        throw new TypeError(`invalid interceptor, expected function received ${typeof interceptor}`)
      }

      dispatch = interceptor(dispatch, interceptorOrigin)

      if (dispatch == null || typeof dispatch !== 'function' || dispatch.length !== 2) {
        throw new TypeError('invalid interceptor')
      }

      // Wrap each interceptor's returned dispatch to publish per-hop
      // enter / exit / error events on the diagnostics channel. Zero-cost
      // when no subscriber is attached.
      dispatch = instrumentDispatchForInterceptor(
        dispatch,
        interceptor.name || 'anonymous'
      )
    }

    const originalDispatch = dispatch
    const self = this
    dispatch = function (opts, handler) {
      if (opts && typeof opts === 'object' && !opts.origin && self[kUrl]) {
        opts = Object.assign({}, opts, { origin: self[kUrl].origin })
      }
      return originalDispatch(opts, handler)
    }

    return new Proxy(this, {
      get: (target, key) => key === 'dispatch' ? dispatch : target[key]
    })
  }
}

module.exports = Dispatcher
