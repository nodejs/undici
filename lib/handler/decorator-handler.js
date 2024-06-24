'use strict'

const noop = () => {}

module.exports = class DecoratorHandler {
  #handler
  #onConnectCalled = false

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
      this.#handler.onConnect?.(noop)
      this.#onConnectCalled = true
    }
    return this.#handler.onError?.(...args)
  }

  onUpgrade (...args) {
    return this.#handler.onUpgrade?.(...args)
  }

  onResponseStarted (...args) {
    return this.#handler.onResponseStarted?.(...args)
  }

  onHeaders (...args) {
    return this.#handler.onHeaders?.(...args)
  }

  onData (...args) {
    return this.#handler.onData?.(...args)
  }

  onComplete (...args) {
    return this.#handler.onComplete?.(...args)
  }

  onBodySent (...args) {
    return this.#handler.onBodySent?.(...args)
  }
}
