'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { Client, errors } = require('..')
const net = require('node:net')

function closeServer (server) {
  return new Promise((resolve, reject) => {
    server.close((err) => err ? reject(err) : resolve())
  })
}

function requestAndRead (client) {
  return new Promise((resolve, reject) => {
    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      if (err) {
        reject(err)
        return
      }

      data.body.resume()
      data.body.on('end', resolve)
      data.body.on('error', (err) => {
        if (err instanceof errors.HTTPParserError) {
          resolve()
        } else {
          reject(err)
        }
      })
    })
  })
}

function writeMalformedResponse (socket) {
  socket.write('HTTP/1.1 200 OK\r\n')
  socket.write('Content-Length: 1\r\n\r\n')
  socket.write('11111\r\n')
}

function writeEmptyResponse (socket) {
  socket.write('HTTP/1.1 200 OK\r\n')
  socket.write('Content-Length: 0\r\n\r\n')
}

test('https://github.com/mcollina/undici/issues/810', async () => {
  let x = 0
  const server = net.createServer(socket => {
    socket.once('data', () => {
      if (x++ === 0) {
        writeMalformedResponse(socket)
      } else {
        writeEmptyResponse(socket)
      }
    })
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, { pipelining: 2 })

  try {
    await requestAndRead(client)
    await requestAndRead(client)
  } finally {
    await client.destroy()
    await closeServer(server)
  }
})

test('https://github.com/mcollina/undici/issues/810 no pipelining', async () => {
  const server = net.createServer(socket => {
    socket.once('data', () => writeMalformedResponse(socket))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)

  try {
    await requestAndRead(client)
  } finally {
    await client.destroy()
    await closeServer(server)
  }
})

test('https://github.com/mcollina/undici/issues/810 pipelining', async () => {
  const server = net.createServer(socket => {
    socket.once('data', () => writeMalformedResponse(socket))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })

  try {
    await requestAndRead(client)
  } finally {
    await client.destroy()
    await closeServer(server)
  }
})

test('https://github.com/mcollina/undici/issues/810 pipelining 2', async () => {
  const server = net.createServer(socket => {
    socket.once('data', () => writeMalformedResponse(socket))
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`, { pipelining: true })

  try {
    await Promise.all([
      requestAndRead(client),
      requestAndRead(client)
    ])
  } finally {
    await client.destroy()
    await closeServer(server)
  }
})
