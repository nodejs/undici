import { WebSocket as WsWebSocket, WebSocketServer } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { randomBytes } from 'node:crypto'
import { bench, run, group } from 'mitata'

const __GLOBAL_WEBSOCKET__ = true
const __BINARY_SIZE__ = 1024 * 256

let GlobalWebSocket = null

if (__GLOBAL_WEBSOCKET__ && typeof globalThis.WebSocket === 'function') {
  GlobalWebSocket = globalThis.WebSocket
}

const server = new WebSocketServer({ port: 5001 })
const binary = randomBytes(__BINARY_SIZE__)

server.on('connection', (socket) => {
  socket.on('message', (data, _isBinary) => {
    socket.send(data)
    // socket.close();
  })
})

await new Promise((resolve, _reject) => {
  server.on('listening', resolve)
})

const url = `http://localhost:${server.address().port}`

const connections = []

group('echo', () => {
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

server.close()

for (const ws of connections) {
  ws.close()
}
