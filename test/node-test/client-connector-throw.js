'use strict'

const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { Client } = require('../..')
const { createServer } = require('node:http')

const { closeServerAsPromise } = require('../utils/node-http')

test('client does not hang when connector throws synchronously', async (t) => {
  const p = tspl(t, { plan: 4 })

  // We need a server just so the URL resolves, but we'll never actually
  // connect because our custom connector throws before that.
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.end()
  })
  after(closeServerAsPromise(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      connect: () => {
        throw new Error('connector boom')
      }
    })
    after(() => client.destroy())

    // First request should get the error from the throwing connector
    client.request({ path: '/', method: 'GET' }, (err) => {
      p.ok(err instanceof Error)
      p.strictEqual(err.message, 'connector boom')

      // Second request should also get an error and not hang
      client.request({ path: '/', method: 'GET' }, (err) => {
        p.ok(err instanceof Error)
        p.strictEqual(err.message, 'connector boom')
      })
    })
  })

  await p.completed
})

test('client recovers after connector stops throwing', async (t) => {
  const p = tspl(t, { plan: 4 })

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    res.writeHead(200)
    res.end('ok')
  })
  after(closeServerAsPromise(server))

  server.listen(0, () => {
    let shouldThrow = true
    const client = new Client(`http://localhost:${server.address().port}`, {
      connect: (opts, cb) => {
        if (shouldThrow) {
          throw new Error('connector boom')
        }
        // Fall back to default connector behavior via tls/net
        const net = require('node:net')
        const socket = net.connect(opts.port, opts.hostname)
        socket.on('connect', () => cb(null, socket))
        socket.on('error', (err) => cb(err, null))
      }
    })
    after(() => client.destroy())

    // First request fails because connector throws
    client.request({ path: '/', method: 'GET' }, (err) => {
      p.ok(err instanceof Error)
      p.strictEqual(err.message, 'connector boom')

      // Now stop throwing so the next request can succeed
      shouldThrow = false

      client.request({ path: '/', method: 'GET' }, (err, data) => {
        p.ifError(err)
        p.strictEqual(data.statusCode, 200)
      })
    })
  })

  await p.completed
})
