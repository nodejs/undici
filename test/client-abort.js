'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')

test('aborted response errors', (t) => {
  t.plan(3)

  const server = createServer()
  server.once('request', (req, res) => {
    // TODO: res.write will cause body to emit 'error' twice
    // due to bug in readable-stream.
    res.end('asd')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      body.destroy()
      body
        .on('error', err => {
          t.ok(err instanceof errors.RequestAbortedError)
        })
        .on('close', () => {
          t.pass()
        })
    })
  })
})

test('aborted req', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.end(Buffer.alloc(4 + 1, 'a'))
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.destroy.bind(client))

    client.request({
      method: 'POST',
      path: '/',
      body: new Readable({
        read () {
          setImmediate(() => {
            this.destroy()
          })
        }
      })
    }, (err) => {
      t.ok(err instanceof errors.RequestAbortedError)
    })
  })
})
