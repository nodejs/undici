'use strict'

const assert = require('node:assert')
const util = require('../core/util')

function toRawHeaders (headers) {
  const rawHeaders = []
  if (headers != null) {
    for (const [key, value] of Object.entries(headers)) {
      rawHeaders.push(Buffer.from(key), Buffer.from(value))
    }
  }
  return rawHeaders
}

module.exports = class DecoratorHandler {
  #handler
  #onCompleteCalled = false
  #onErrorCalled = false
  #resume = null

  constructor (handler) {
    if (typeof handler !== 'object' || handler === null) {
      throw new TypeError('handler must be an object')
    }
    this.#handler = handler
  }

  // New API

  onRequestStart (abort) {
    this.#handler.onRequestStart?.(abort)
    this.#handler.onConnect?.(abort)
  }

  onResponseStart (resume) {
    let ret = true

    if (this.#handler.onResponseStart?.(resume) === false) {
      ret = false
    }

    this.#resume = resume

    return ret
  }

  onResponseHeaders (headers, statusCode) {
    let ret = true

    if (this.#handler.onResponseHeaders?.(headers, statusCode) === false) {
      ret = false
    }

    if (this.#handler.onHeaders) {
      const rawHeaders = toRawHeaders(headers)
      if (this.#handler.onHeaders(statusCode, rawHeaders, this.#resume) === false) {
        ret = false
      }
    }

    return ret
  }

  onResponseData (data) {
    let ret = true

    if (this.#handler.onResponseData?.(data) === false) {
      ret = false
    }

    if (this.#handler.onData?.(data) === false) {
      ret = false
    }

    return ret
  }

  onResponseEnd (trailers) {
    this.#handler.onResponseEnd?.(trailers)

    if (this.#handler.onComplete) {
      const rawHeaders = toRawHeaders(trailers)
      this.#handler.onComplete(rawHeaders)
    }
  }

  onResponseError (err) {
    this.#handler.onResponseError?.(err)
    this.#handler.onError?.(err)
  }

  // Old API

  onRequestSent (...args) {
    if (this.#handler.onRequestSent) {
      this.#handler.onRequestSent(...args)
    }
  }

  onConnect (...args) {
    if (this.#handler.onRequestStart) {
      this.#handler.onRequestStart(args[0])
    }

    if (this.#handler.onConnect) {
      return this.#handler.onConnect(...args)
    }
  }

  onError (...args) {
    this.#onErrorCalled = true

    if (this.#handler.onResponseError) {
      this.#handler.onResponseError(args[0])
    }

    if (this.#handler.onError) {
      return this.#handler.onError(...args)
    }
  }

  onUpgrade (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onUpgrade?.(...args)
  }

  onResponseStarted (...args) {
    assert(!this.#onCompleteCalled)
    // assert(!this.#onErrorCalled)

    return this.#handler.onResponseStarted?.(...args)
  }

  onHeaders (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    let ret

    if (this.#handler.onResponseStart) {
      if (this.#handler.onResponseStart(args[2]) === false) {
        // TODO (fix): Strictly speaking we should not call onRepsonseHeaders
        // after this...
        ret = false
      }
    }

    if (this.#handler.onResponseHeaders) {
      if (this.#handler.onResponseHeaders(util.parseHeaders(args[1]), args[0]) === false) {
        ret = false
      }
    }

    if (this.#handler.onHeaders) {
      ret ??= this.#handler.onHeaders(...args)
    }

    return ret
  }

  onData (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    if (this.#handler.onResponseData) {
      this.#handler.onResponseData(args[0])
    }

    if (this.#handler.onData) {
      return this.#handler.onData(...args)
    }
  }

  onComplete (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#onCompleteCalled = true

    if (this.#handler.onResponseEnd) {
      this.#handler.onResponseEnd(util.parseHeaders(args[0]))
    }

    if (this.#handler.onComplete) {
      return this.#handler.onComplete(...args)
    }
  }

  onBodySent (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onBodySent?.(...args)
  }
}
