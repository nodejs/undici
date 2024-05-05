import { WebSocketServer } from 'ws'

const server = new WebSocketServer({ port: 5001 })

server.on('connection', (socket) => {
  socket.on('message', (data, isBinary) => {
    socket.send(data, { binary: isBinary })
    // socket.close();
  })
})
