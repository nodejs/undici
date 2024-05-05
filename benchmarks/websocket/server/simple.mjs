import { WebSocketServer } from 'ws'

const server = new WebSocketServer({ port: 5001 })

// Workaround for https://github.com/nodejs/undici/issues/3202
const emptyBuffer = Buffer.allocUnsafe(1)

server.on('connection', (socket) => {
  socket.on('message', (_data, _isBinary) => {
    socket.send(emptyBuffer)
    // socket.close();
  })
})
