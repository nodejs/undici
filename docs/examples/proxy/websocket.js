'use strict'

const { Pool, Client } = require('../../../')
const http = require('node:http')
const proxy = require('./proxy')
const WebSocket = require('ws')

const pool = new Pool('http://localhost:4001', {
  connections: 256,
  pipelining: 1
})

function createWebSocketServer () {
  const wss = new WebSocket.Server({ noServer: true })

  wss.on('connection', ws => {
    ws.on('message', message => {
      console.log(`Received message: ${message}`)
      ws.send('Received your message!')
    })
  })

  return wss
}

async function run () {
  await Promise.all([
    new Promise(resolve => {
      // Proxy
      http.createServer((req, res) => {
        proxy({ req, res, proxyName: 'example' }, pool).catch(err => {
          if (res.headersSent) {
            res.destroy(err)
          } else {
            for (const name of res.getHeaderNames()) {
              res.removeHeader(name)
            }
            res.statusCode = err.statusCode || 500
            res.end()
          }
        })
      }).listen(4000, resolve)
    }),
    new Promise(resolve => {
      // Upstream
      http.createServer((req, res) => {
        res.end('hello world')
      }).listen(4001, resolve)
    }),
    new Promise(resolve => {
      // WebSocket server
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' })
        res.end('WebSocket server is running!')
      })

      const wss = createWebSocketServer()

      server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, ws => {
          wss.emit('connection', ws, request)
        })
      })

      server.listen(4002, resolve)
    })
  ])

  const client = new Client('http://localhost:4000')
  const { body } = await client.request({
    method: 'GET',
    path: '/'
  })

  for await (const chunk of body) {
    console.log(String(chunk))
  }

  // WebSocket client
  const ws = new WebSocket('ws://localhost:4002')
  ws.on('open', () => {
    ws.send('Hello, WebSocket Server!')
  })

  ws.on('message', message => {
    console.log(`WebSocket Server says: ${message}`)
    ws.close()
  })
}

run()
