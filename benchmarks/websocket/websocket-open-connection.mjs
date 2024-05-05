import { WebSocket as WsWebSocket, WebSocketServer } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { bench, run, group } from 'mitata'

const __GLOBAL_WEBSOCKET__ = true

let GlobalWebSocket = null

if (__GLOBAL_WEBSOCKET__ && typeof globalThis.WebSocket === 'function') {
  GlobalWebSocket = globalThis.WebSocket
}

const server = new WebSocketServer({ port: 5001 })

server.on('connection', (socket) => {
  socket.on('open', () => {
    // socket.close();
  })
})

await new Promise((resolve, _reject) => {
  server.on('listening', resolve)
})

const url = `http://localhost:${server.address().port}`

group('open connection', () => {
  bench('ws', () => {
    const ws = new WsWebSocket(url)
    ws.binaryType = 'fragments'
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

server.close()
