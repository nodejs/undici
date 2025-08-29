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

async function generateAndRunBundle (url) {
  try {
    const response = await fetch(url)
    const body = await response.text()

    // Scripts may have src tags without being enclosed in quotes. This matches both
    // <script src="whatever"></script> and
    // <script src=whatever></script> (See )
    const scriptSrcRegex = /<script[^>]*src="?([^"\s>]*)"?[^>]*><\/script>/g
    const inlineScriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g

    const scriptContents = []

    let match
    while ((match = scriptSrcRegex.exec(body)) !== null) {
      const src = match[1]

      try {
        const scriptUrl = new URL(src, url)
        log(`Loading script: ${scriptUrl}`)
        const scriptResponse = await fetch(scriptUrl)
        if (scriptResponse.ok) {
          const scriptContent = await scriptResponse.text()
          scriptContents.push(scriptContent)
        }
      } catch (error) {
        console.warn(`Failed to load script: ${src}`)
      }
    }

    // Extract inline scripts
    while ((match = inlineScriptRegex.exec(body)) !== null) {
      const scriptContent = match[1]
      scriptContents.push(scriptContent)
    }

    log(`Loaded ${scriptContents.length} scripts`)

    // Execute all scripts in order
    for (let i = 0; i < scriptContents.length; i++) {
      log(`Executing script ${i + 1}/${scriptContents.length}`)
      try {
        runInThisContext(scriptContents[i])
      } catch (error) {
        console.error(`Error in script ${i + 1}:`, error)
        throw error
      }
    }

    log('All scripts executed')

    // Now set up the WPT test harness callbacks
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
          process.exit(harnessStatus.status === 0 ? 0 : 1)
        }, 50)
      } else {
        process.exit(harnessStatus.status === 0 ? 0 : 1)
      }
    })
  } catch (error) {
    console.error('Test execution failed:', error)

    if (process.platform === 'win32') {
      // https://github.com/nodejs/node/issues/56645#issuecomment-3077594952
      setTimeout(() => process.exit(1), 50)
    } else {
      process.exit(1)
    }
  }
}

generateAndRunBundle(testUrl)
