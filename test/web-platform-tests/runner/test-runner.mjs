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
import { Cache } from '../../../lib/web/cache/cache.js'
import { CacheStorage } from '../../../lib/web/cache/cachestorage.js'
import { runInThisContext } from 'node:vm'
import { debuglog } from 'node:util'

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

const log = debuglog('UNDICI_WPT')
const testUrl = process.argv[2]

// Set up environment
globalThis.window = globalThis.self = globalThis
globalThis.location = new URL(testUrl)
globalThis.Window = Object.getPrototypeOf(globalThis).constructor

setGlobalOrigin(globalThis.location)

function setupGlobalTestharnessCallbacks () {
  globalThis.add_result_callback(({ message, name, stack, status }) => {
    const data = JSON.stringify({ name, status, message, stack })
    process.stdout.write(data + '\n')
  })

  globalThis.add_completion_callback((tests, harnessStatus) => {
    process.stdout.write('#$#$#' + JSON.stringify({ tests, harnessStatus }) + '\n')
    process.stdout._flush?.()

    if (process.platform === 'win32') {
      // https://github.com/nodejs/node/issues/56645#issuecomment-3077594952
      setTimeout(() => {
        // eslint-disable-next-line n/no-process-exit
        process.exit(harnessStatus.status === 0 ? 0 : 1)
      }, 50)
    } else {
      // eslint-disable-next-line n/no-process-exit
      process.exit(harnessStatus.status === 0 ? 0 : 1)
    }
  })
}

process.on('uncaughtException', (reason) => {
  process.stderr.write(`!#!#!#${JSON.stringify({ error: { stack: reason.stack, message: reason.message } })}\n`)
})

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`!#!#!#${JSON.stringify({ error: { stack: reason.stack, message: reason.message } })}\n`)
})

async function generateAndRunBundle (url) {
  const response = await fetch(url)
  const body = await response.text()

  // Scripts may have src tags without being enclosed in quotes. This matches both
  // <script src="whatever"></script> and
  // <script src=whatever></script>
  const scriptSrcRegex = /<script[^>]*src="?([^"\s>]*)"?[^>]*><\/script>/g
  const inlineScriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g

  /** @type {{ url?: URL; content: string }[]} */
  const scripts = []

  let match
  while ((match = scriptSrcRegex.exec(body)) !== null) {
    const src = match[1]

    try {
      const scriptUrl = new URL(src, url)
      log(`Loading script: ${scriptUrl}`)
      const scriptResponse = await fetch(scriptUrl)
      if (scriptResponse.ok) {
        const scriptContent = await scriptResponse.text()
        scripts.push({ url: scriptUrl, content: scriptContent })
      }
    } catch (error) {
      console.warn(`Failed to load script: ${src}`)
    }
  }

  // Extract inline scripts
  while ((match = inlineScriptRegex.exec(body)) !== null) {
    const scriptContent = match[1]
    scripts.push({ content: scriptContent })
  }

  log(`Loaded ${scripts.length} scripts`)

  // Execute all scripts in order
  for (let i = 0; i < scripts.length; i++) {
    log(`Executing script ${i + 1}/${scripts.length}`)
    runInThisContext(scripts[i].content)

    // Once the testharness is loaded, we want to setup the callbacks in case
    // an error is thrown outside of the tests.
    if (scripts[i].url?.pathname === '/resources/testharness.js') {
      setupGlobalTestharnessCallbacks()
    }
  }

  log('All scripts executed')
}

generateAndRunBundle(testUrl)
