'use strict'

const assert = require('node:assert')
const { test } = require('node:test')
const { once } = require('node:events')
const { Client, errors } = require('..')
const net = require('node:net')

function closeServer (server) {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve())
  })
}

function request (client) {
  return new Promise((resolve, reject) => {
    client.request({ path: '/', method: 'GET' }, (err) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

// TODO: move to test/node-test/client-connect.js
test('parser error', async () => {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      socket.end('asd\n\r213123')
    })
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)

  try {
    await assert.rejects(request(client), errors.HTTPParserError)
  } finally {
    await client.destroy()
    await closeServer(server)
  }
})
