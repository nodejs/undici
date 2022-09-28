import { runInThisContext } from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'
import {
  setGlobalOrigin,
  Response,
  Request,
  fetch,
  FormData,
  File,
  Headers
} from '../../../../index.js'

const { initScripts, meta, test, url } = workerData

const globalPropertyDescriptors = {
  writable: true,
  enumerable: false,
  configurable: true
}

Object.defineProperties(globalThis, {
  fetch: {
    ...globalPropertyDescriptors,
    value: fetch
  },
  File: {
    ...globalPropertyDescriptors,
    value: File
  },
  FormData: {
    ...globalPropertyDescriptors,
    value: FormData
  },
  Headers: {
    ...globalPropertyDescriptors,
    value: Headers
  },
  Request: {
    ...globalPropertyDescriptors,
    value: Request
  },
  Response: {
    ...globalPropertyDescriptors,
    value: Response
  }
})

// self is required by testharness
// GLOBAL is required by self
runInThisContext(`
  globalThis.self = globalThis
  globalThis.GLOBAL = {
    isWorker () {
      return false
    },
    isShadowRealm () {
      return false
    }
  }
  globalThis.window = globalThis
  globalThis.location = new URL('${url}')
`)

await import('../resources/testharness.cjs')

// add_*_callback comes from testharness
// stolen from node's wpt test runner
// eslint-disable-next-line no-undef
add_result_callback((result) => {
  parentPort.postMessage({
    type: 'result',
    result: {
      status: result.status,
      name: result.name,
      message: result.message,
      stack: result.stack
    }
  })
})

// eslint-disable-next-line no-undef
add_completion_callback((_, status) => {
  parentPort.postMessage({
    type: 'completion',
    status
  })
})

setGlobalOrigin(url)

// Inject any script the user provided before
// running the tests.
for (const initScript of initScripts) {
  runInThisContext(initScript)
}

// Inject any files from the META tags
for (const script of meta.scripts) {
  runInThisContext(script)
}

// Finally, run the test.
runInThisContext(test)
