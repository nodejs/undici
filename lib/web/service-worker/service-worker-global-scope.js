import { parentPort } from 'node:worker_threads'
import { Clients, kAddClient } from './clients.js'
import { ServiceWorker } from './service-worker.js'
import { Client } from './client.js'
import { CacheStorage } from '../cache/cachestorage.js'

/**
 * Custom implementation of the `ServiceWorkerGlobalScope` object.
 * This acts as `self` in the global scope of the Service Worjer.
 */
export class ServiceWorkerGlobalScope extends EventTarget {
  /** @type {import('./service-worker-container.js').WorkerData} */
  #parentData

  /**
   * @param {import('./service-worker-container.js').WorkerData} parentData
   */
  constructor (parentData) {
    super()

    this.#parentData = parentData
    this.serviceWorker = this.#createServiceWorker()
    this.clients = new Clients(this.serviceWorker)
    this.#addClient(parentData.clientInfo)

    this.caches = new CacheStorage()
  }

  /**
   * Create a representation of this Service Worker
   * that will communicate its events to the parent thread.
   * @returns {ServiceWorker}
   */
  #createServiceWorker () {
    const serviceWorker = new ServiceWorker(
      this.#parentData.scriptUrl,
      (value, transfer) => {
        /**
         * @todo This should technically post message
         * to itself (the same worker thread)?
         */
        throw new Error('Not implemented')
      }
    )

    process
      .once('uncaughtException', () => {
        serviceWorker.dispatchEvent(new Event('error'))
      })
      .once('unhandledRejection', () => {
        serviceWorker.dispatchEvent(new Event('error'))
      })

    // Forward Service Worker events to the client
    // so it updates its Service Worker instance accordingly.
    serviceWorker.addEventListener('statechange', () => {
      parentPort.postMessage({
        type: 'worker/statechange',
        state: serviceWorker.state
      })
    })
    serviceWorker.addEventListener('error', () => {
      parentPort.postMessage({ type: 'worker/error' })
    })

    return serviceWorker
  }

  /**
   * @param {import('./client.js').SerializedClient} clientInfo
   * @returns {void}
   */
  #addClient (clientInfo) {
    const { clientMessagePort } = this.#parentData
    const client = new Client(
      clientInfo.id,
      clientInfo.url,
      clientInfo.type,
      clientInfo.frameType
    )
    client.postMessage = clientMessagePort.postMessage.bind(clientMessagePort)
    this.clients[kAddClient](client)
  }
}
