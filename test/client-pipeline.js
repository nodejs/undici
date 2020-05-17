'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const { pipeline, Readable, Writable } = require('stream')

test('pipeline echo', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    req.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.tearDown(client.close.bind(client))

    let res = ''
    const buf = Buffer.alloc(1e6).toString()
    pipeline(
      new Readable({
        read () {
          this.push(buf)
          this.push(null)
        }
      }),
      client.pipeline({
        path: '/',
        method: 'PUT'
      }, ({ statusCode, headers }) => {
      }, (err) => {
        t.error(err)
      }),
      new Writable({
        write (chunk, encoding, callback) {
          res += chunk.toString()
          callback()
        },
        final (callback) {
          t.strictEqual(buf, res)
          callback()
        }
      }),
      (err) => {
        t.error(err)
      }
    )
  })
})

test('pipeline invalid handler', (t) => {
  t.plan(1)

  const client = new Client('http://localhost:5000')
  try {
    client.pipeline({}, null)
  } catch (err) {
    t.ok(/handler/.test(err))
  }
})
