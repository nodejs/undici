'use strict'

const { createServer } = require('node:http')
const { request } = require('../..')

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('hello world')
})

server.listen(0, () => {
  const { port, address, family } = server.address()
  const hostname = family === 'IPv6' ? `[${address}]` : address
  request(`http://${hostname}:${port}`)
    .then(res => res.body.dump())
    .then(() => {
      server.close()
    })
})
