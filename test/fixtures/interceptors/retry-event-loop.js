'use strict'

const { LOOPBACK_HOST } = require('./../../utils/node-http')
const { createServer } = require('node:http')
const { once } = require('node:events')
const {
  Client,
  interceptors: { retry }
} = require('../../..')

const server = createServer({ joinDuplicateHeaders: true })

server.on('request', (req, res) => {
  res.writeHead(418, { 'Content-Type': 'text/plain' })
  res.end('teapot')
})

server.listen(0)
once(server, 'listening').then(() => {
  const client = new Client(
    `http://${LOOPBACK_HOST}:${server.address().port}`
  ).compose(
    retry({
      maxTimeout: 1000,
      maxRetries: 3,
      statusCodes: [418]
    })
  )

  return client.request({
    method: 'GET',
    path: '/'
  })
})
