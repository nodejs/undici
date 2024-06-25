'use strict'

const assert = require('node:assert')
const noop = () => {}

module.exports = class DecoratorHandler {
  #handler
  #onConnectCalled = false
  #onCompleteCalled = false
  #onErrorCalled = false

  constructor (handler) {
    if (typeof handler !== 'object' || handler === null) {
      throw new TypeError('handler must be an object')
    }
    this.#handler = handler
  }

  onConnect (...args) {
    this.#onConnectCalled = true
    return this.#handler.onConnect?.(...args)
  }

  onError (...args) {
    if (!this.#onConnectCalled) {
      this.#onConnectCalled = true
      this.#handler.onConnect?.(noop)
    }

    this.#onErrorCalled = true
    return this.#handler.onError?.(...args)
  }

  onUpgrade (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onUpgrade?.(...args)
  }

  onResponseStarted (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onResponseStarted?.(...args)
  }

  onHeaders (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onHeaders?.(...args)
  }

  onData (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onData?.(...args)
  }

  onComplete (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    this.#onCompleteCalled = true
    return this.#handler.onComplete?.(...args)
  }

  onBodySent (...args) {
    assert(!this.#onCompleteCalled)
    assert(!this.#onErrorCalled)

    return this.#handler.onBodySent?.(...args)
  }
}
