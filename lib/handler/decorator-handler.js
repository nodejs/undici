'use strict'

const assert = require('node:assert')
const util = require('../core/util')
const kAssignResume = Symbol('assignResume')

function toRawHeaders (headers) {
  const rawHeaders = []
  if (headers != null) {
    for (const [key, value] of Object.entries(headers)) {
      rawHeaders.push(Buffer.from(key), Buffer.from(value))
    }
  }
  return rawHeaders
}

class CompatController {
  #paused = true
  #abort
  #resume
  #reason = null
  #aborted = false

  constructor (abort) {
    this.#abort = abort
  }

  get aborted () {
    return this.#aborted
  }

  get reason () {
    return this.#reason
  }

  get paused () {
    return this.#paused
  }

  abort (reason) {
    this.#reason = reason
    this.#aborted = true
    this.#abort(reason)
  }

  resume () {
    this.#paused = false
    this.#resume?.()
  }

  pause () {
    this.#paused = true
  }

  [kAssignResume] (resume) {
    this.#resume = resume
    if (!this.#paused) {
      this.#resume()
    }
  }
}

module.exports = class DecoratorHandler {
  #controller
  #handler
  #onCompleteCalled = false
  #onErrorCalled = false

  constructor (handler) {
    if (typeof handler !== 'object' || handler === null) {
      throw new TypeError('handler must be an object')
    }
    this.#handler = handler
  }

  // New API

  onResponseStart (controller) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#handler.onResponseStart?.(controller)

    if (this.#handler.onConnect) {
      this.#handler.onConnect((reason) => controller.abort(reason))
    }
  }

  onResponseHeaders (controller, headers, statusCode) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#handler.onResponseHeaders?.(controller, headers, statusCode)

    if (this.#handler.onHeaders) {
      this.#handler.onHeaders(statusCode, toRawHeaders(headers), () => controller.resume())
    }
  }

  onResponseData (controller, data) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#handler.onResponseData?.(controller, data)

    if (this.#handler.onData?.(data) === false) {
      controller.pause()
    }
  }

  onResponseEnd (controller, trailers) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#onCompleteCalled = true

    this.#handler.onResponseEnd?.(controller, trailers)

    if (this.#handler.onComplete) {
      this.#handler.onComplete(toRawHeaders(trailers))
    }
  }

  onResponseError (controller, err) {
    this.#onErrorCalled = true

    this.#handler.onResponseError?.(controller, err)

    this.#handler.onError?.(err)
  }

  // Legacy API

  onConnect (abort) {
    this.#controller = new CompatController(abort)

    if (this.#handler.onResponseStart) {
      this.#handler.onResponseStart(this.#controller)
    }

    if (this.#handler.onConnect) {
      this.#handler.onConnect((reason) => this.#controller.abort(reason))
    }
  }

  onHeaders (statusCode, headers, resume, statusText) {
    assert(this.#controller)
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#controller[kAssignResume](resume)

    if (this.#handler.onResponseHeaders) {
      this.#handler.onResponseHeaders(this.#controller, util.parseHeaders(headers), statusCode)
    }

    if (this.#handler.onHeaders?.(statusCode, headers, () => this.#controller.resume(), statusText) === false) {
      this.#controller.pause()
    }

    return !this.#controller.paused
  }

  onData (data) {
    assert(this.#controller)
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    if (this.#handler.onResponseData) {
      this.#handler.onResponseData(this.#controller, data)
    }

    if (this.#handler.onData?.(data) === false) {
      this.#controller.pause()
    }

    return !this.#controller.paused
  }

  onComplete (trailers) {
    assert(this.#controller)
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#onCompleteCalled = true

    if (this.#handler.onResponseEnd) {
      this.#handler.onResponseEnd(this.#controller, util.parseHeaders(trailers))
    }

    if (this.#handler.onComplete) {
      this.#handler.onComplete(trailers)
    }
  }

  onError (err) {
    this.#onErrorCalled = true

    if (this.#handler.onResponseError) {
      this.#handler.onResponseError(this.#controller, err)
    }

    if (this.#handler.onError) {
      this.#handler.onError(err)
    }
  }

  // Old API

  onResponseStarted (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onResponseStarted?.(...args)
  }

  onBodySent (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onBodySent?.(...args)
  }

  onUpgrade (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onUpgrade?.(...args)
  }
}
