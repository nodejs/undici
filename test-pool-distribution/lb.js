const net = require('node:net')

const backends = [3001, 3002, 3003, 3004, 3005]
let currentIndex = 0

net.createServer((clientSocket) => {
  const backendPort = backends[currentIndex]
  currentIndex = (currentIndex + 1) % backends.length

  console.log(`New connection -> backend on port ${backendPort}`)

  const backendSocket = net.connect(backendPort, '127.0.0.1')

  clientSocket.pipe(backendSocket)
  backendSocket.pipe(clientSocket)

  clientSocket.on('error', () => {
    backendSocket.destroy()
  })

  backendSocket.on('error', () => {
    clientSocket.destroy()
  })

  clientSocket.on('close', () => {
    backendSocket.destroy()
  })

  backendSocket.on('close', () => {
    clientSocket.destroy()
  })
}).listen(8080, () => console.log('Load balancer listening on port 8080'))
