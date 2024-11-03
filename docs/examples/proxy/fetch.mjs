import * as http from 'node:http'
import { once } from 'node:events'
import { createProxy } from 'proxy'
import { ProxyAgent } from '../../../index.js'

const proxyServer = createProxy(http.createServer())
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('okay')
})

proxyServer.on('request', (req, res) => {
  console.log(`Incoming request to ${req.url}`)
})

await once(proxyServer.listen(0), 'listening')
await once(server.listen(0), 'listening')

const { port: proxyPort } = proxyServer.address()
const { port } = server.address()

console.log(`Proxy listening on port ${proxyPort}`)
console.log(`Server listening on port ${port}`)
try {
  // undici does a tunneling to the proxy server using CONNECT.
  const agent = new ProxyAgent(`http://localhost:${proxyPort}`)
  const response = await fetch(`http://localhost:${port}`, {
    dispatcher: agent,
    method: 'GET'
  })
  const data = await response.text()
  console.log('Response data:', data)
} catch (e) {
  console.log(e)
}
