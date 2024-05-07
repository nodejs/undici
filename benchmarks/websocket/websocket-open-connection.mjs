// --------------------SERVER--------------------
// -> /server/simple.mjs
// ----------------------------------------------

import { WebSocket as WsWebSocket } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { bench, run, group } from 'mitata'

const __GLOBAL_WEBSOCKET__ = true

let GlobalWebSocket = null

if (__GLOBAL_WEBSOCKET__ && typeof globalThis.WebSocket === 'function') {
  GlobalWebSocket = globalThis.WebSocket
}

const url = 'http://localhost:5001'

group('open connection', () => {
  bench('ws', () => {
    const ws = new WsWebSocket(url)
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve()
        ws.close()
      })
      ws.addEventListener('error', (err) => {
        reject(err)
      })
    })
  })
  bench('undici', () => {
    const ws = new UndiciWebSocket(url)
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => {
        resolve()
        ws.close()
      })
      ws.addEventListener('error', (err) => {
        reject(err)
      })
    })
  })
  if (typeof GlobalWebSocket === 'function') {
    bench('undici - global', () => {
      const ws = new GlobalWebSocket(url)
      return new Promise((resolve, reject) => {
        ws.addEventListener('open', () => {
          resolve()
          ws.close()
        })
        ws.addEventListener('error', (err) => {
          reject(err)
        })
      })
    })
  }
})

await run()
