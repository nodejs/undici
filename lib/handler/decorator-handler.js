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

  onRequestStart (reserved, abort) {
    if (this.#handler.onRequestStart) {
      this.#handler.onRequestStart(null, abort)
    }
  }

  onResponseStart (resume) {
    this.#resume = resume

    if (this.#handler.onResponseStart) {
      return this.#handler.onResponseStart(resume)
    }

    return true
  }

  onResponseHeaders (statusCode, headers) {
    if (this.#handler.onResponseHeaders) {
      this.#handler.onResponseHeaders(headers, statusCode)
    }

    if (this.#handler.onConnect) {
      this.#handler.onConnect(statusCode, toRawHeaders(headers), this.#resume)
    }

    return true
  }

  onResponseData (data) {
    if (this.#handler.onResponseData) {
      this.#handler.onResponseData(data)
    }

    if (this.#handler.onData) {
      this.#handler.onData(data)
    }

    return true
  }

  onResponseEnd (trailers) {
    if (this.#handler.onResponseEnd) {
      this.#handler.onResponseEnd(trailers)
    }

    if (this.#handler.onComplete) {
      this.#handler.onComplete(toRawHeaders(trailers))
    }
  }

  onResponseError (err) {
    if (this.#handler.onResponseError) {
      this.#handler.onResponseError(err)
    }

    if (this.#handler.onError) {
      this.#handler.onError(err)
    }
  }

  // Old API

  onRequestSent (...args) {
    if (this.#handler.onRequestSent) {
      this.#handler.onRequestSent(...args)
    }
  }

  onConnect (...args) {
    if (this.#handler.onRequestStart) {
      this.#handler.onRequestStart(null, args[0])
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

    let paused = false

    if (this.#handler.onResponseStart) {
      paused ||= this.#handler.onResponseStart(args[2]) === false
    }

    if (this.#handler.onResponseHeaders) {
      paused ||= this.#handler.onResponseHeaders(util.parseHeaders(args[1]), args[0]) === false
    }

    if (this.#handler.onHeaders) {
      paused ||= this.#handler.onHeaders(...args) === false
    }

    return paused
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
