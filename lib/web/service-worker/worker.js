import * as fs from 'node:fs'
import * as vm from 'node:vm'
import { workerData, parentPort as maybeParentPort } from 'node:worker_threads'
import { ServiceWorkerGlobalScope } from './service-worker-global-scope.js'
import { ExtendableEvent, kPendingPromises } from './extendable-event.js'
import { InstallEvent } from './install-event.js'
import { FetchEvent, kResponsePromise } from './fetch-event.js'

const parentPort = maybeParentPort

if (!parentPort) {
  throw new Error('Failed to run worker: missing parent process')
}

/** @type {import('./ServiceWorkerContainer.js').WorkerData} */
const parentData = workerData

// Create the Service Worker's global scope object (`self`).
const globalScope = new ServiceWorkerGlobalScope(parentData)

process.once('uncaughtException', (error) => {
  console.error(error)
  globalScope.serviceWorker.dispatchEvent(new Event('error'))
})

const content = fs.readFileSync(parentData.scriptUrl, 'utf8')

parentPort.postMessage({
  type: 'worker/statechange',
  state: 'parsed'
})

// Run the worker script within the controller global scope.
const script = new vm.Script(content)

script.runInNewContext({
  global: globalScope,
  globalThis: globalScope,
  self: globalScope,
  setTimeout,
  setInterval,
  Blob,
  FormData,
  Headers,
  Request,
  Response,
  console
})

// Forward messages from the parent process
// as the "message" events on the Service Worker.
parentPort.addListener('message', (data) => {
  globalScope.dispatchEvent(new MessageEvent('message', { data }))
})

parentData.interceptorMessagePort.addListener('message', (data) => {
  switch (data.type) {
    case 'request': {
      const { requestId, request: requestInit } = data
      const request = new Request(requestInit.url, requestInit)
      const fetchEvent = new FetchEvent('fetch', {
        request
        /** @todo clientId */
      })

      globalScope.dispatchEvent(fetchEvent)

      /** @todo Handle the case when FetchEvent doesn't handle the request. */

      fetchEvent[kResponsePromise].then(async (response) => {
        const responseBody = await response.arrayBuffer()
        parentData.interceptorMessagePort.postMessage(
          {
            type: 'response',
            requestId,
            response: {
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              body: response.body === null ? null : responseBody
            }
          },
          [responseBody]
        )
      })
      break
    }
  }
})

async function startServiceWorkerLifeCycle () {
  // Installed event.
  globalScope.serviceWorker.state = 'installing'
  const installEvent = new InstallEvent('install')
  globalScope.dispatchEvent(installEvent)
  await Promise.allSettled(installEvent[kPendingPromises])
  globalScope.serviceWorker.state = 'installed'

  // Activated event.
  globalScope.serviceWorker.state = 'activating'
  const activateEvent = new ExtendableEvent('activate')
  globalScope.dispatchEvent(activateEvent)
  await Promise.allSettled(activateEvent[kPendingPromises])
  globalScope.serviceWorker.state = 'activated'
}
startServiceWorkerLifeCycle()
