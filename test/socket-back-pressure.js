'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const { Readable } = require('node:stream')
const { test, after } = require('node:test')

test('socket back-pressure', async (t) => {
  t = tspl(t, { plan: 3 })

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
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`, {
    pipelining: 1
  })
  after(() => client.close())

  client.request({ path: '/', method: 'GET', opaque: 'asd' }, (err, data) => {
    t.ifError(err)
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
        t.ok(true, 'pass')
      })
  })
  await t.completed
})
