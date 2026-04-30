'use strict'

const { test, after } = require('node:test')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')
const { createSecureServer } = require('node:http2')

const pem = require('@metcoder95/https-pem')

const { Client } = require('..')
const { InformationalError } = require('../lib/core/errors')

test('should surface invalid HTTP/2 connection headers as a catchable error and resume queued requests', async (t) => {
  t = tspl(t, { plan: 8 })

  const http2 = require('node:http2')
  const originalConnect = http2.connect

  let connectCount = 0
  let streamCount = 0
  let shouldThrow = true

  http2.connect = function connect (...args) {
    connectCount++

    const session = originalConnect.apply(this, args)
    const originalRequest = session.request

    session.request = function request (...requestArgs) {
      if (shouldThrow) {
        shouldThrow = false

        const err = new TypeError('HTTP/1 Connection specific headers are forbidden: "http2-settings"')
        err.code = 'ERR_HTTP2_INVALID_CONNECTION_HEADERS'
        throw err
      }

      return originalRequest.apply(this, requestArgs)
    }

    return session
  }

  after(() => {
    http2.connect = originalConnect
  })

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  server.on('stream', (stream) => {
    streamCount++
    stream.respond({
      ':status': 200,
      'content-type': 'text/plain; charset=utf-8'
    })
    stream.end('hello world')
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

  const firstRequest = client.request({
    path: '/',
    method: 'GET'
  }).catch(err => err)

  const secondRequest = client.request({
    path: '/',
    method: 'GET'
  })

  const err = await firstRequest
  t.ok(err instanceof InformationalError)
  t.strictEqual(err.code, 'UND_ERR_INFO')
  t.strictEqual(err.message, 'HTTP/1 Connection specific headers are forbidden: "http2-settings"')
  t.ok(err.cause instanceof TypeError)
  t.strictEqual(err.cause.code, 'ERR_HTTP2_INVALID_CONNECTION_HEADERS')

  const response = await secondRequest
  t.strictEqual(connectCount, 2)
  t.strictEqual(streamCount, 1)
  t.strictEqual(await response.body.text(), 'hello world')

  await t.completed
})
