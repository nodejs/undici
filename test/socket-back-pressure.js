'use strict'

const { Client } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')
const { test } = require('tap')

test('socket back-pressure', (t) => {
  t.plan(2)

  const server = createServer()

  let body

  server.on('request', (req, res) => {
    let bytesWritten = 0
    const buf = Buffer.allocUnsafe(16384)
    new Readable({
      read () {
        bytesWritten += buf.length
        this.push(buf)
        if (bytesWritten >= 1e6) {
          this.push(null)
        }
      }
    }).on('end', () => {
      t.ok(body._readableState.length < body._readableState.highWaterMark)
    }).pipe(res)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })

    client.request({ path: '/', method: 'GET', opaque: 'asd' }, (err, data) => {
      t.error(err)
      body = data.body
        .resume()
        .on('data', () => {
          data.body.pause()
        })
    })
  })
})
