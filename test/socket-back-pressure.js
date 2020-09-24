'use strict'

const { Client } = require('..')
const { createServer } = require('http')
const { Readable } = require('stream')
const { test } = require('tap')

test('socket back-pressure', (t) => {
  t.plan(3)

  const server = createServer()
  let bytesWritten = 0

  const buf = Buffer.allocUnsafe(16384)
  const src = new Readable({
    read () {
      bytesWritten += buf.length
      this.push(buf)
      if (bytesWritten >= 1e6) {
        this.push(null)
      }
    }
  })

  server.on('request', (req, res) => {
    src.pipe(res)
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      pipelining: 1
    })
    t.tearDown(client.destroy.bind(client))

    client.request({ path: '/', method: 'GET', opaque: 'asd' }, (err, data) => {
      t.error(err)
      data.body
        .resume()
        .once('data', () => {
          data.body.pause()
          // TODO: Try to avoid timeout.
          setTimeout(() => {
            t.ok(data.body._readableState.length < bytesWritten - data.body._readableState.highWaterMark)
            src.push(null)
            data.body.resume()
          }, 1e3)
        })
        .on('end', () => {
          t.pass()
        })
    })
  })
})
