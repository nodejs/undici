'use strict'

const { WebSocketServer } = require('ws')
const { WebSocket } = require('../..')

const server = new WebSocketServer({ port: 0 })

server.on('connection', ws => {
  ws.close(1000, 'goodbye')
})
server.on('listening', () => {
  const { port } = server.address()
  const ws = new WebSocket(`ws://localhost:${port}`, 'chat')

  ws.addEventListener('close', () => {
    server.close()
  })
})
