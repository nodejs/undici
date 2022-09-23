import { readFileSync } from 'node:fs'
import { createContext, runInContext, runInThisContext } from 'node:vm'
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

const { initScripts, paths, url } = workerData

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

for (const initScript of initScripts) {
  runInThisContext(initScript)
}

for (const path of paths) {
  const code = readFileSync(path, 'utf-8')
  const context = createContext(globalThis)

  runInContext(code, context, { filename: path })
}
