'use strict'

const net = require('node:net')
const serverFuzzFns = [
  require('./server-fuzz-append-data'),
  require('./server-fuzz-split-data')
]

const netServer = net.createServer(socket => {
  socket.on('data', data => {
    serverFuzzFns[(Math.random() * 2) | 0](socket, data)
  })
})

module.exports = netServer
