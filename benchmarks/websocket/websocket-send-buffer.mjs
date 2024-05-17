// --------------------SERVER--------------------
// -> /server/simple.mjs
// ----------------------------------------------

import { WebSocket as WsWebSocket } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { randomBytes } from 'node:crypto'
import { bench, run, group } from 'mitata'

process.env.UNDICI_USE_WS_MASKING = true

const __GLOBAL_WEBSOCKET__ = false
const __BINARY_SIZE__ = 1024 * 256

let GlobalWebSocket = null

if (__GLOBAL_WEBSOCKET__ && typeof globalThis.WebSocket === 'function') {
  GlobalWebSocket = globalThis.WebSocket
}

const binary = randomBytes(__BINARY_SIZE__)

const url = 'http://localhost:5001'

const connections = []

group('send', () => {
  {
    const ws = new WsWebSocket(url)
    let _resolve
    ws.addEventListener('message', () => {
      _resolve()
    })
    bench('ws', () => {
      return new Promise((resolve, reject) => {
        ws.send(binary)
        _resolve = resolve
      })
    })
    connections.push(ws)
  }
  {
    const ws = new UndiciWebSocket(url)
    let _resolve
    ws.addEventListener('message', () => {
      _resolve()
    })
    bench('undici', () => {
      return new Promise((resolve, reject) => {
        ws.send(binary)
        _resolve = resolve
      })
    })
    connections.push(ws)
  }
  if (typeof GlobalWebSocket === 'function') {
    const ws = new GlobalWebSocket(url)
    let _resolve
    ws.addEventListener('message', () => {
      _resolve()
    })
    bench('undici - global', () => {
      return new Promise((resolve, reject) => {
        ws.send(binary)
        _resolve = resolve
      })
    })
    connections.push(ws)
  }
})

for (const ws of connections) {
  // for fairness
  ws.binaryType = 'arraybuffer'
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve()
    })
    ws.addEventListener('error', (err) => {
      reject(err)
    })
  })
}

await run()

for (const ws of connections) {
  ws.close()
}
