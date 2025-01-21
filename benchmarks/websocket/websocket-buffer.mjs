import { WebSocket as WsWebSocket } from 'ws'
import { WebSocket as UndiciWebSocket } from '../../index.js'
import { bench, run, lineplot } from 'mitata'

const __BINARY_SIZE__ = 1024 * 512

const binary = Buffer.alloc(__BINARY_SIZE__, '_')

const url = 'http://localhost:5001'

const connections = []

lineplot(() => {
  {
    const ws = new WsWebSocket(url)
    let _resolve
    ws.on('message', () => {
      _resolve()
    })
    bench('ws ($messages)', function * (state) {
      const messages = state.get('messages')
      const chunk = binary.subarray(0, __BINARY_SIZE__ / messages)
      yield () => new Promise((resolve, reject) => {
        for (let i = 0; i < messages; ++i) ws.send(chunk)
        let id = 0
        _resolve = () => {
          if (++id === messages) {
            resolve()
          }
        }
      })
    }).range('messages', 1, 256)
    connections.push(ws)
  }
  {
    const ws = new UndiciWebSocket(url)
    let _resolve
    ws.addEventListener('message', () => {
      _resolve()
    })
    bench('undici ($messages)', function * (state) {
      const messages = state.get('messages')
      const chunk = binary.subarray(0, __BINARY_SIZE__ / messages)
      yield () => new Promise((resolve, reject) => {
        for (let i = 0; i < messages; ++i) ws.send(chunk)
        let id = 0
        _resolve = () => {
          if (++id === messages) {
            resolve()
          }
        }
      })
    }).range('messages', 1, 256)
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
