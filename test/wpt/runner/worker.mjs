import buffer from 'node:buffer'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext, runInThisContext } from 'node:vm'
import { parentPort, workerData } from 'node:worker_threads'
import {
  fetch,
  FormData,
  Headers,
  Request,
  Response,
  setGlobalOrigin,
  CloseEvent,
  WebSocket,
  caches,
  EventSource,
  WebSocketStream,
  WebSocketError
} from '../../../index.js'
// TODO(@KhafraDev): export these in index.js
import { Cache } from '../../../lib/web/cache/cache.js'
import { CacheStorage } from '../../../lib/web/cache/cachestorage.js'
import { webcrypto } from 'node:crypto'

const { initScripts, meta, test, url, path } = workerData

process.on('uncaughtException', (err) => {
  parentPort.postMessage({
    type: 'error',
    error: {
      message: err.message,
      name: err.name,
      stack: err.stack
    }
  })
})

const basePath = join(process.cwd(), 'test/fixtures/wpt')
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
    value: buffer.File
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
  WebSocket: {
    ...globalPropertyDescriptors,
    value: WebSocket
  },
  CloseEvent: {
    ...globalPropertyDescriptors,
    value: CloseEvent
  },
  Blob: {
    ...globalPropertyDescriptors,
    // See https://github.com/nodejs/node/pull/45659
    value: buffer.Blob
  },
  caches: {
    ...globalPropertyDescriptors,
    value: caches
  },
  Cache: {
    ...globalPropertyDescriptors,
    value: Cache
  },
  CacheStorage: {
    ...globalPropertyDescriptors,
    value: CacheStorage
  },
  EventSource: {
    ...globalPropertyDescriptors,
    value: EventSource
  },
  WebSocketStream: {
    ...globalPropertyDescriptors,
    value: WebSocketStream
  },
  WebSocketError: {
    ...globalPropertyDescriptors,
    value: WebSocketError
  }
})

// TODO: remove once Float16Array is added. Otherwise a test throws with an uncaught exception.
globalThis.Float16Array ??= class Float16Array {}

// TODO: remove once node 18 is dropped
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    ...globalPropertyDescriptors,
    value: webcrypto
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
    },
    isWindow () {
      return false
    }
  }
  globalThis.window = globalThis
  globalThis.location = new URL('${urlPath.replace(/\\/g, '/')}', '${url}')
  globalThis.Window = Object.getPrototypeOf(globalThis).constructor
`)

if (meta.title) {
  runInThisContext(`globalThis.META_TITLE = "${meta.title.replace(/"/g, '\\"')}"`)
}

const harness = readFileSync(join(basePath, '/resources/testharness.js'), 'utf-8')
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

setGlobalOrigin(globalThis.location)

// Inject any script the user provided before
// running the tests.
for (const initScript of initScripts) {
  runInThisContext(initScript)
}

// Inject any files from the META tags
for (const script of meta.scripts) {
  runInThisContext(script)
}

// A few tests require gc, which can't be passed to a Worker.
// see https://github.com/nodejs/node/issues/16595#issuecomment-340288680
setFlagsFromString('--expose-gc')
globalThis.gc = runInNewContext('gc')

// Finally, run the test.
runInThisContext(test)
