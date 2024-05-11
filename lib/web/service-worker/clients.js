import { isWithinScope } from './utils/isWithinScope.js'

/**
 * @typedef {Object} MatchAllOptions
 * @property {boolean} [includeUncontrolled]
 * @property {import('./client.js').ClientType} [type]
 */

export const kAddClient = Symbol('kAddClient')

export class Clients {
  /** @type {import('./service-worker.js').ServiceWorker} */
  #serviceWorker

  /** @type {Map<string, Client>} */
  #clients

  /**
   * @param {import('./service-worker.js').ServiceWorker} serviceWorker
   */
  constructor (serviceWorker) {
    this.#serviceWorker = serviceWorker
  }

  /**
   * Internal method to add the given client to the list of clients.
   * @param {Client} client
   * @returns {void}
   */
  [kAddClient] (client) {
    this.#clients.set(client.id, client)
  }

  /**
   * @param {string} id
   * @returns {Promise<Client | undefined>}
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Clients/get
   */
  async get (id) {
    return this.#clients.get(id)
  }

  /**
   * @param {MatchAllOptions | undefined} options
   * @returns {Promise<Client[]>}
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Clients/matchAll
   */
  async matchAll (options) {
    /** @type {Array<Client>} */
    const clients = []

    for (const [, client] of this.#clients) {
      if (options?.type && client.type !== options.type) {
        break
      }

      if (options?.includeUncontrolled) {
        break
      }

      clients.push(client)
    }

    return clients
  }

  /**
   * Set the current Service Worker as the controller
   * for all the clients within its scope.
   * @returns {Promise<void>}
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim
   */
  async claim () {
    for (const [, client] of this.#clients) {
      if (isWithinScope(client.url, this.#serviceWorker.scope)) {
        /**
         * @todo Set the current worker as the controller
         * for all the clients that lie within its scope.
         */
      }
    }
  }

  /**
   * @returns {Promise<void>}
   *
   * @see https://w3c.github.io/ServiceWorker/#clients-openwindow
   */
  async openWindow () {
    // Browser-specific method, do nothing for compatibility.
  }
}
