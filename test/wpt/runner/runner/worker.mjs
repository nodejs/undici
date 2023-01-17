import { join } from 'node:path'
import { runInThisContext } from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'
import { readFileSync } from 'node:fs'
import buffer from 'node:buffer'
import {
  setGlobalOrigin,
  Response,
  Request,
  fetch,
  FormData,
  File,
  Headers,
  FileReader
} from '../../../../index.js'
import { WebSocket } from '../../../../lib/websocket/websocket.js'
import { CloseEvent } from '../../../../lib/websocket/events.js'

const { initScripts, meta, test, url, path } = workerData

const basePath = join(process.cwd(), 'test/wpt/tests')
const urlPath = path.slice(basePath.length)

const globalPropertyDescriptors = {
  writable: true,
  enumerable: false,
  configurable: true
}

Object.defineProperties(globalThis, {
  fetch: {
    ...globalPropertyDescriptors,
    enumerable: true,
    value: fetch
  },
  File: {
    ...globalPropertyDescriptors,
    value: buffer.File ?? File
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
  },
  FileReader: {
    ...globalPropertyDescriptors,
    value: FileReader
  },
  WebSocket: {
    ...globalPropertyDescriptors,
    value: WebSocket
  },
  CloseEvent: {
    ...globalPropertyDescriptors,
    value: CloseEvent
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
    },
    isWindow () {
      return false
    }
  }
  globalThis.window = globalThis
  globalThis.location = new URL('${url}')
  globalThis.Window = Object.getPrototypeOf(globalThis).constructor
`)

const harness = readFileSync(join(basePath, '../runner/resources/testharness.cjs'), 'utf-8')
runInThisContext(harness)

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

setGlobalOrigin(new URL(urlPath, url))

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
