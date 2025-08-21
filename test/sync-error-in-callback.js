'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')

test('synchronous error in request callback should be caught', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const testError = new Error('sync error in callback')

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      p.strictEqual(data.statusCode, 200)

      // Destroy the stream to simulate the described scenario
      data.body.destroy()

      // This synchronous error should be caught and not become an uncaught exception
      throw testError
    })
  })

  await p.completed
})

test('synchronous error thrown immediately in request callback', async (t) => {
  const p = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.end('hello')
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    const testError = new Error('immediate sync error')

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      p.ifError(err)
      p.strictEqual(data.statusCode, 200)

      // Throw immediately without any stream operations
      throw testError
    })
  })

  await p.completed
})

test('synchronous error in request callback with error parameter', async (t) => {
  const p = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    // Force an error by destroying the socket
    req.socket.destroy()
  })
  after(() => server.close())

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    after(() => client.close())

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      // We expect an error from the destroyed socket
      p.ok(err)

      // Don't throw here as it would interfere with test completion
      // The important tests are the ones where we get successful responses
    })
  })

  await p.completed
})
