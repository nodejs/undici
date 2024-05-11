/**
 * @typedef { 'parsed' | 'installing' | 'installed' | 'activating' | 'activated' | 'redundant' } ServiceWorkerState
 */

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker
 */
export class ServiceWorker extends EventTarget {
  /** @type {ServiceWorkerState} */
  #state

  /** @type {tring} */
  scriptUrl

  /** @type {MessagePort['postMessage']} */
  postMessage

  /**
   * @param {string} scriptUrl
   * @param {MessagePort['postMessage']} postMessage
   */
  constructor (scriptUrl, postMessage) {
    super()
    this.#state = ''
    this.scriptUrl = scriptUrl
    this.postMessage = postMessage.bind(this)
  }

  /**
   * @returns {ServiceWorkerState}
   */
  get state () {
    return this.#state
  }

  /**
   * @param {ServiceWorkerState} nextState
   */
  set state (nextState) {
    this.#state = nextState

    if (nextState !== 'parsed') {
      this.dispatchEvent(new Event('statechange'))
    }
  }
}
