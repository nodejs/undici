import { WebSocket as WsWebSocket } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { bench, run, group } from 'mitata'

const __BINARY_SIZE__ = 1024 * 256

const binary = Buffer.alloc(__BINARY_SIZE__, '_').toString('utf-8')

const url = 'http://localhost:5001'

const connections = []

group('send', () => {
  {
    const ws = new WsWebSocket(url)
    let _resolve
    ws.on('message', () => {
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
