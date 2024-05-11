export const kPendingPromises = Symbol('kPendingPromises')

/**
 * @see https://w3c.github.io/ServiceWorker/#extendableevent-interface
 */
export class ExtendableEvent extends Event {
  /** @type {Array<Proise<any>>} */
  [kPendingPromises]

  /** @type {number} */
  #pendingPromiseCount

  /**
   * @param {string} type
   * @param {EventInit} eventInitDict
   */
  constructor (type, eventInitDict) {
    super(type, eventInitDict)
    this[kPendingPromises] = []
    this.#pendingPromiseCount = 0
  }

  /**
   * @param {Promise<any>} promise
   * @returns {void}
   *
   * @see https://w3c.github.io/ServiceWorker/#wait-until-method
   */
  waitUntil (promise) {
    this[kPendingPromises].push(promise)
    this.#pendingPromiseCount++

    promise.finally(() => {
      queueMicrotask(() => {
        this.#pendingPromiseCount--
      })
    })
  }
}
