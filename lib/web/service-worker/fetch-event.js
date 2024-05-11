import { DeferredPromise } from '@open-draft/deferred-promise'
import { ExtendableEvent } from './extendable-event.js'
import { InvalidStateError } from './utils/errors.js'

/**
 * @typedef {Object} FetchEventInit
 * @property {Request} request
 * @property {Promise<void>} [preloadResponse]
 * @property {string} [clientId]
 * @property {string} [resultingClientId]
 * @property {string} [replacesClientId]
 * @property {Promise<void>} [handled]
 */

const kRespondWithEntered = Symbol('kRespondWithEntered')
const kWaitToRespond = Symbol('kWaitToRespond')
const kRespondWithError = Symbol('kRespondWithError')
export const kResponsePromise = Symbol('kResponsePromise')

/**
 * @see https://w3c.github.io/ServiceWorker/#fetchevent-interface
 */
export class FetchEvent extends ExtendableEvent {
  /** @type {string} */
  clientId
  /** @type {Request} */
  request
  /** @type {Promise<void>} */
  preloadResponse
  /** @type {string} */
  resultingClientId
  /** @type {string} */
  replacesClientId
  /** @type {Promise<void>;} */
  handled;

  /** @type {boolean} */
  [kRespondWithEntered];
  /** @type {boolean} */
  [kWaitToRespond];
  /** @type {boolean} */
  [kRespondWithError];
  /** @type {DeferredPromise<Response>} */
  [kResponsePromise]

  /**
   *
   * @param {string} type
   * @param {FetchEventInit} [options]
   */
  constructor (type, options) {
    super(type, options)
    this.clientId = options.clientId || ''
    this.request = options.request
    this.preloadResponse = options.preloadResponse || Promise.resolve()
    this.resultingClientId = options.resultingClientId || ''
    this.replacesClientId = options.replacesClientId || ''
    this.handled = options.handled || new DeferredPromise()

    this[kResponsePromise] = new DeferredPromise()
  }

  /**
   * @param {Response | Promise<Response>} response
   * @returns {Promise<void>}
   *
   * @see https://w3c.github.io/ServiceWorker/#fetch-event-respondwith
   */
  async respondWith (response) {
    if (this[kRespondWithEntered]) {
      throw new InvalidStateError('Cannot call respondWith() multiple times')
    }

    const innerResponse = Promise.resolve(response)
    this.waitUntil(innerResponse)

    // This flag is never unset because a single FetchEvent
    // can be responded to only once.
    this[kRespondWithEntered] = true
    this[kWaitToRespond] = true

    /**
     * @note This is a simplified implementation of the spec.
     */
    innerResponse
      .then((response) => {
        // Returning non-Response from ".respondWith()"
        // results in a network error.
        if (!(response instanceof Response)) {
          this[kRespondWithError] = true
          this.#handleFetch(Response.error())
        } else {
          this.#handleFetch(response)
        }

        this[kWaitToRespond] = undefined
      })
      .catch(() => {
        this[kRespondWithError] = true
        this[kWaitToRespond] = undefined
      })
  }

  /**
   * Resolve the pending response promise with the given response.
   * This is used internally.
   * @param {Response} response
   * @returns {void}
   */
  #handleFetch (response) {
    this[kResponsePromise].resolve(response)
  }
}
