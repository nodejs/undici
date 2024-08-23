// fetch-test.js
const { fetch } = require('.')
const { createServer } = require('node:http')

const port = 8080
const url = 'http://localhost:' + port

const server = createServer((req, res) => res.end()).listen(port, async () => {
  await fetch(url)
  server.closeIdleConnections()

  setImmediate(async () => {
    await fetch(url) // Throws TypeError with cause UND_ERR_SOCKET or ECONNRESET
    server.close()
  })
})
