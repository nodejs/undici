import { Worker, MessageChannel } from 'node:worker_threads'
import { DeferredPromise } from '@open-draft/deferred-promise'
import { ServiceWorkerRegistration } from './service-worker-registration.js'
import { ServiceWorker } from './service-worker.js'
import { parseModuleUrlFromStackTrace } from './utils/parseModuleUrlFromStackTrace.js'
import { interceptor } from './interceptor.js'

/**
 * @typedef {Object} WorkerData
 * @property {string} scriptUrl
 * @property {unknown} options @todo
 * @property {import('./client.js').SerializedClient} clientInfo
 * @property {MessagePort} clientMessagePort
 * @property {MessagePort} interceptorMessagePort
 */

const clientMessageChannel = new MessageChannel()
const interceptorMessageChannel = new MessageChannel()

/**
 * @see https://w3c.github.io/ServiceWorker/#serviceworkercontainer-interface
 */
export class ServiceWorkerContainer {
  /** @type {ServiceWorkerRegistration | undefined} */
  #registration
  /** @type {DeferredPromise<ServiceWorkerRegistration>} */
  #ready

  /** @todo Event handlers (oncontrollerchange, onmessage, onerror) */

  constructor () {
    this.#ready = new DeferredPromise()
  }

  /**
   * @returns {Promise<ServiceWorkerRegistration>}
   *
   * @see https://w3c.github.io/ServiceWorker/#navigator-service-worker-ready
   */
  get ready () {
    return this.#ready
  }

  /**
   * @returns {ServiceWorker | null}
   *
   * @see https://w3c.github.io/ServiceWorker/#navigator-service-worker-controller
   */
  get controller () {
    return this.#registration?.active || null
  }

  /**
   * @param {string} scriptUrl
   * @param {ServiceWorkerRegistrationOptions} [options]
   * @returns {Promise<ServiceWorkerRegistration>}
   *
   * @see https://w3c.github.io/ServiceWorker/#navigator-service-worker-register
   */
  async register (scriptUrl, options = {}) {
    /** @type {SerializedClient} */
    const clientInfo = {
      id: process.pid.toString(),
      url: parseModuleUrlFromStackTrace(new Error()),
      type: 'worker',
      frameType: '???' /** @todo */
    }

    const worker = new Worker(new URL('./worker.ts', import.meta.url), {
      name: `[worker ${scriptUrl}]`,
      workerData: {
        scriptUrl,
        options,
        clientInfo,
        clientMessagePort: clientMessageChannel.port2,
        interceptorMessagePort: interceptorMessageChannel.port2
      },
      transferList: [
        clientMessageChannel.port2,
        interceptorMessageChannel.port2
      ]
    })

    const serviceWorker = this.#createServiceWorker(scriptUrl, worker)
    const registration = new ServiceWorkerRegistration(serviceWorker)
    this.#registration = registration

    serviceWorker.addEventListener('statechange', () => {
      if (serviceWorker.state === 'activating') {
        this.#ready.resolve(registration)
      }
    })

    this.#enableRequestInterception(interceptorMessageChannel)

    return registration
  }

  /**
   * @param {string} clientUrl
   * @returns {Promise<ServiceWorkerRegistration | undefined>}
   *
   * @see https://w3c.github.io/ServiceWorker/#navigator-service-worker-getRegistration
   */
  getRegistration (clientUrl) {
    throw new Error('Not implemented')
  }

  /**
   * @returns {Promise<Array<ServiceWorkerRegistration>>}
   *
   * @see https://w3c.github.io/ServiceWorker/#navigator-service-worker-getRegistrations
   */
  getRegistrations () {
    throw new Error('Not implemented')
  }

  /**
   * @param {string} scriptUrl
   * @param {Worker} worker
   * @returns {ServiceWorker}
   */
  #createServiceWorker (scriptUrl, worker) {
    const serviceWorker = new ServiceWorker(
      scriptUrl,
      worker.postMessage.bind(worker)
    )

    // Listen to the Service Worker signaling its events
    // and update the main thread Service Worker instance accordingly.
    worker.addListener('message', (message) => {
      switch (message.type) {
        case 'worker/statechange': {
          serviceWorker.state = message.state
          break
        }
        case 'worker/error': {
          serviceWorker.dispatchEvent(new Event('error'))
          break
        }
      }
    })

    // Forward the messages sent via `client.postMessage()` in the worker
    // directly to the Service Worker interface.
    clientMessageChannel.port1.addListener('message', (data) => {
      serviceWorker.dispatchEvent(new MessageEvent('message', { data }))
    })

    return serviceWorker
  }

  /**
   * @param {MessageChannel} channel
   * @returns {void}
   */
  #enableRequestInterception (channel) {
    interceptor.apply()

    interceptor.on('request', async ({ requestId, request }) => {
      const requestBody = await request.arrayBuffer()
      channel.port1.postMessage(
        {
          type: 'request',
          requestId,
          request: {
            method: request.method,
            url: request.url,
            headers: Object.fromEntries(request.headers.entries()),
            body:
              request.method === 'HEAD' || request.method === 'GET'
                ? null
                : requestBody
          }
        },
        [requestBody]
      )

      const responsePromise = new DeferredPromise()

      const responseListener = (data) => {
        if (requestId === data.requestId) {
          /** @todo Response may also be undefined */
          const response = new Response(data.response.body, data.response)
          responsePromise.resolve(response)

          // Remove this listener since the request has been handled.
          channel.port1.removeListener('message', responseListener)
        }
      }
      channel.port1.addListener('message', responseListener)

      const response = await responsePromise
      if (response) {
        request.respondWith(response)
      }
    })

    /** @todo Dispose of the interceptor */
  }
}
