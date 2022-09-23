import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
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
import { parseMeta } from './util.mjs'
import { fileURLToPath } from 'node:url'

const resourcePath = fileURLToPath(join(import.meta.url, '../../resources'))
const { initScripts, paths, url } = workerData

const globalPropertyDescriptors = {
  writable: true,
  enumerable: false,
  configurable: true
}

function assignGlobals (global) {
  Object.defineProperties(global, {
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
}

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

for (const initScript of initScripts) {
  runInThisContext(initScript)
}

// Some tests will declare global variables that will interfere with
// other tests. This allows us to clone globalThis such that
// each object on the new `context` is the same as `globalThis`.
const globalDescriptors = Object.getOwnPropertyDescriptors(globalThis)

for (const path of paths) {
  const code = readFileSync(path, 'utf-8')

  const ctx = {}
  Object.defineProperties(ctx, globalDescriptors)
  assignGlobals(ctx) // override Node.js fetch globals

  const context = createContext(ctx)
  const { scripts } = parseMeta(code)

  // /common/utils.js -> wpt/runner/resources/common/utils.js
  // ../request/request-error.js -> join(currentTestPath, '..')/../request/request-error.js
  const scriptPathsResolved = scripts.map((script) => isAbsolute(script)
    ? join(resourcePath, script)
    : join(path, '..', script)
  )

  for (const script of scriptPathsResolved) {
    const scriptCode = readFileSync(script, 'utf-8')

    runInContext(scriptCode, context, { filename: script })
  }

  runInContext(code, context, { filename: path })
}
