/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration
 */
export class ServiceWorkerRegistration extends EventTarget {
  /** @type {import('./service-worker.js').ServiceWorker} */
  #serviceWorker

  /**
   * @param {import('./service-worker.js').ServiceWorker} serviceWorker
   */
  constructor (serviceWorker) {
    super()
    this.#serviceWorker = serviceWorker
  }

  /**
   * @returns {ServiceWorker | null}
   */
  get installing () {
    if (this.#serviceWorker.state === 'installing') {
      return this.#serviceWorker
    }

    return null
  }

  /**
   * @returns {ServiceWorker | null}
   */
  get waiting () {
    if (this.#serviceWorker.state === 'installed') {
      return this.#serviceWorker
    }

    return null
  }

  /**
   * @returns {ServiceWorker | null}
   */
  get active () {
    if (
      this.#serviceWorker.state === 'activating' ||
      this.#serviceWorker.state === 'activated'
    ) {
      return this.#serviceWorker
    }

    return null
  }
}
