// @ts-check

import { bench } from './_util/runner.js'
import { formatBytes } from './_util/index.js'
import { WebSocket, WebSocketStream } from '../index.js'
import { WebSocket as WsWebSocket } from 'ws'

/**
 * @type {Record<string, { fn: (ws: any, binary: string | Uint8Array) => import('./_util/runner.js').BenchMarkHandler; connect: (url: string) => Promise<any>; binaries: (string | Uint8Array)[] }>}
 */
const experiments = {}
/**
 * @type {Record<string, { bytes: number; binaryType: 'string' | 'binary' }>}
 */
const experimentsInfo = {}

/**
 * @type {any[]}
 */
const connections = []

const binary = Buffer.alloc(256 * 1024, '_')
const binaries = [binary, binary.subarray(0, 256 * 1024).toString('utf-8')]

experiments['undici'] = {
  fn: (ws, binary) => {
    if (!(ws instanceof WebSocket)) {
      throw new Error("'undici' websocket are expected.")
    }

    return (ev) => {
      ws.addEventListener(
        'message',
        () => {
          ev.end()
        },
        { once: true }
      )

      ev.start()
      ws.send(binary)
    }
  },

  connect: async (url) => {
    const ws = new WebSocket(url)

    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        function onOpen () {
          resolve()
          ws.removeEventListener('open', onOpen)
          ws.removeEventListener('error', onError)
        }
        function onError (err) {
          reject(err)
          ws.removeEventListener('open', onOpen)
          ws.removeEventListener('error', onError)
        }
        ws.addEventListener('open', onOpen)
        ws.addEventListener('error', onError)
      })
    )

    // avoid create blob
    ws.binaryType = 'arraybuffer'

    return ws
  },

  binaries
}

experiments['undici - stream'] = {
  fn: (ws, binary) => {
    /** @type {ReadableStreamDefaultReader<string | Uint8Array>} */
    const reader = ws.reader
    /** @type {WritableStreamDefaultWriter<string | BufferSource>} */
    const writer = ws.writer

    return async (ev) => {
      ev.start()
      await writer.write(binary)
      await reader.read()
      ev.end()
    }
  },

  connect: async (url) => {
    const ws = new WebSocketStream(url)

    const { readable, writable } = await ws.opened
    const reader = readable.getReader()
    const writer = writable.getWriter()

    // @ts-ignore
    return { reader, writer, close: () => ws.close() }
  },

  binaries
}

experiments['ws'] = {
  fn: (ws, binary) => {
    if (!(ws instanceof WsWebSocket)) {
      throw new Error("'ws' websocket are expected.")
    }

    return (ev) => {
      ws.once('message', () => {
        ev.end()
      })
      ev.start()
      ws.send(binary)
    }
  },

  connect: async (url) => {
    const ws = new WsWebSocket(url, { maxPayload: 1024 * 1024 * 1024 })

    await /** @type {Promise<void>} */ (
      new Promise((resolve, reject) => {
        function onOpen () {
          resolve()
          ws.off('open', onOpen)
          ws.off('error', onError)
        }
        function onError (err) {
          reject(err)
          ws.off('open', onOpen)
          ws.off('error', onError)
        }
        ws.on('open', onOpen)
        ws.on('error', onError)
      })
    )

    ws.binaryType = 'arraybuffer'

    return ws
  },

  binaries
}

async function init () {
  /** @type {Record<string, import('./_util/runner.js').BenchMarkHandler>} */
  const round = {}

  const keys = Object.keys(experiments)

  for (let i = 0; i < keys.length; ++i) {
    const name = keys[i]

    const { fn, connect, binaries } = experiments[name]

    const ws = await connect('ws://localhost:8080')

    const needShowBytes = binaries.length !== 2 || typeof binaries[0] === typeof binaries[1]
    for (let i = 0; i < binaries.length; ++i) {
      const binary = binaries[i]
      const bytes = Buffer.byteLength(binary)

      const binaryType = typeof binary === 'string' ? 'string' : 'binary'
      const roundName = needShowBytes
        ? `${name} [${formatBytes(bytes)} (${binaryType})]`
        : `${name} [${binaryType}]`

      round[roundName] = fn(ws, binary)
      experimentsInfo[roundName] = { bytes, binaryType }
    }

    connections.push(ws)
  }

  return round
}

init()
  .then((round) => bench(round, {
    minSamples: 2048
  }))
  .then((results) => {
    print(results)

    for (const ws of connections) {
      ws.close()
    }
  }, (err) => {
    process.nextTick((err) => {
      throw err
    }, err)
  })

/**
 * @param {{ name: string; average: number; iterationPerSecond: number; }[]} results
 */
function print (results) {
  for (const { name, average, iterationPerSecond } of results) {
    const { bytes } = experimentsInfo[name]

    console.log(
      `${name}: transferred ${formatBytes((bytes / average) * 1e9)} Bytes/s (${iterationPerSecond.toFixed(4)} per/sec)`
    )
  }
}

export {}
