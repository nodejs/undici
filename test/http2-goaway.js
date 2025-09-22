'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')

test('#3046 - GOAWAY Frame', async t => {
  t = tspl(t, { plan: 10 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))

  server.on('stream', (stream, headers) => {
    setTimeout(() => {
      if (stream.closed) return
      stream.end('Hello World')
    }, 100)

    stream.respond({
      'content-type': 'text/plain; charset=utf-8',
      'x-custom-h2': 'hello',
      ':status': 200
    })
  })

  server.on('session', session => {
    setTimeout(() => {
      session.goaway()
    }, 50)
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    allowH2: true
  })
  after(() => client.close())

  client.on('disconnect', (url, disconnectClient, err) => {
    t.ok(url instanceof URL)
    t.deepStrictEqual(disconnectClient, [client])
    t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
  })

  client.on('connectionError', (url, disconnectClient, err) => {
    t.ok(url instanceof URL)
    t.deepStrictEqual(disconnectClient, [client])
    t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
  })

  const response = await client.request({
    path: '/',
    method: 'GET',
    headers: {
      'x-my-header': 'foo'
    }
  })

  t.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
  t.strictEqual(response.headers['x-custom-h2'], 'hello')
  t.strictEqual(response.statusCode, 200)

  await t.rejects(response.body.text(), {
    message: 'HTTP/2: "GOAWAY" frame received with code 0',
    code: 'UND_ERR_SOCKET'
  })

  await t.completed
})

test('#3753 - Handle GOAWAY Gracefully', async (t) => {
  t = tspl(t, { plan: 30 })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  let counter = 0
  let session = null

  server.on('session', s => {
    session = s
  })

  server.on('stream', (stream) => {
    counter++

    // Due to the nature of the test, we need to ignore the error
    // that is thrown when the session is destroyed and stream
    // is in-flight
    stream.on('error', () => {})
    if (counter === 9 && session != null) {
      session.goaway()
      stream.end()
    } else {
      stream.respond({
        'content-type': 'text/plain',
        ':status': 200
      })
      setTimeout(() => {
        stream.end('hello world')
      }, 150)
    }
  })

  after(() => server.close())
  await once(server.listen(0), 'listening')

  const client = new Client(`https://localhost:${server.address().port}`, {
    connect: {
      rejectUnauthorized: false
    },
    pipelining: 2,
    allowH2: true
  })
  after(() => client.close())

  for (let i = 0; i < 15; i++) {
    client.request({
      path: '/',
      method: 'GET',
      headers: {
        'x-my-header': 'foo'
      }
    }, (err, response) => {
      if (err) {
        t.strictEqual(err.message, 'HTTP/2: "GOAWAY" frame received with code 0')
        t.strictEqual(err.code, 'UND_ERR_SOCKET')
      } else {
        t.strictEqual(response.statusCode, 200)
        ;(async function () {
          let body
          try {
            body = await response.body.text()
          } catch (err) {
            t.strictEqual(err.code, 'UND_ERR_SOCKET')
            return
          }
          t.strictEqual(body, 'hello world')
        })()
      }
    })
  }

  await t.completed
})
