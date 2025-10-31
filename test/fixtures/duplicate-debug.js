'use strict'

const { createServer } = require('node:http')
const { request } = require('../..')

// Simulate the scenario where diagnostics module is loaded multiple times
// This mimics having both Node.js built-in undici and undici as dependency
delete require.cache[require.resolve('../../lib/core/diagnostics.js')]
require('../../lib/core/diagnostics.js')

const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
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
