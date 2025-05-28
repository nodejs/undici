'use strict'

const { createServer } = require('node:http')
const { fetch } = require('../..')

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('hello world')
})

server.listen(0, () => {
  const { port, address, family } = server.address()
  const hostname = family === 'IPv6' ? `[${address}]` : address
  fetch(`http://${hostname}:${port}`)
    .then(
      res => res.body.cancel(),
      () => {}
    )
    .then(() => {
      server.close()
    })
})
