import cluster from 'node:cluster'
import { WebSocketServer } from 'ws'
import { cpus } from 'node:os'

if (cluster.isPrimary) {
  let cpu = cpus().length
  while (cpu-- > 0) {
    cluster.fork()
  }
} else {
  const server = new WebSocketServer({
    maxPayload: 600 * 1024 * 1024,
    perMessageDeflate: false,
    clientTracking: false,
    port: 5001
  })

  server.on('connection', (socket) => {
    socket.on('message', (data, isBinary) => {
      socket.send(data, { binary: isBinary })
      // socket.close();
    })
  })

  cluster.on('exit', () => {
    server.close()
  })
}
