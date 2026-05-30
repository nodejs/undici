'use strict'

const { test, after } = require('node:test')
const { EventEmitter, once } = require('node:events')
const { createSecureServer } = require('node:http2')
const { tspl } = require('@matteo.collina/tspl')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('invalid HTTP/2 session stream creation is requeued on a fresh session', async (t) => {
  t = tspl(t, { plan: 5 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  class FakeSession extends EventEmitter {
    constructor () {
      super()
      this.closed = false
      this.destroyed = false
    }

    request () {
      const err = new Error('The session has been destroyed')
      err.code = 'ERR_HTTP2_INVALID_SESSION'
      throw err
    }

    destroy () {
      if (this.destroyed) {
        return
      }

      this.destroyed = true
      this.emit('close')
    }

    ref () {}
    unref () {}
  }

  const session = new FakeSession()
  let connectCalls = 0
  let streams = 0

  http2.connect = function connectStub (...args) {
    connectCalls++

    if (connectCalls === 1) {
      return session
    }

    return originalConnect.apply(this, args)
  }

  after(() => {
    http2.connect = originalConnect
  })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', (stream) => {
    streams++
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    }
  })
  after(() => client.close())

  const response = await client.request({ path: '/', method: 'GET' })
  const chunks = []
  response.body.on('data', chunk => {
    chunks.push(chunk)
  })
  await once(response.body, 'end')

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(Buffer.concat(chunks).toString(), 'ok')
  t.strictEqual(streams, 1)
  t.strictEqual(connectCalls, 2)
  t.strictEqual(session.destroyed, true)

  await t.completed
})

test('truncated HTTP/2 server session resets the client session', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  const serverSockets = []
  let streams = 0

  server.on('secureConnection', (socket) => {
    socket.on('error', () => {})
    serverSockets.push(socket)
  })
  server.on('sessionError', () => {})
  server.on('tlsClientError', () => {})

  server.on('stream', (stream) => {
    streams++

    if (streams === 1) {
      stream.respond({ ':status': 200 })
      stream.write('partial', () => {
        setImmediate(() => {
          serverSockets[0].destroy()
        })
      })
      return
    }

    stream.respond({ ':status': 200 })
    stream.end('ok')
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    allowH2: true,
    connect: {
      rejectUnauthorized: false
    },
    maxConcurrentStreams: 1
  })
  after(() => client.close())

  const first = await client.request({ path: '/', method: 'GET' })

  first.body.resume()
  const [err] = await once(first.body, 'error')
  t.ok(err.code === 'UND_ERR_SOCKET' || err.code === 'ECONNRESET')

  const response = await client.request({ path: '/second', method: 'GET' })
  const chunks = []
  response.body.on('data', chunk => {
    chunks.push(chunk)
  })
  await once(response.body, 'end')

  t.strictEqual(response.statusCode, 200)
  t.strictEqual(Buffer.concat(chunks).toString(), 'ok')
  t.strictEqual(streams, 2)

  await t.completed
})
