'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('node:http')
const EE = require('node:events')

test('https://github.com/nodejs/undici/issues/803', (t) => {
  t.plan(2)

  const SIZE = 5900373096

  const server = createServer(async (req, res) => {
    res.setHeader('content-length', SIZE)
    let pos = 0
    while (pos < SIZE) {
      const len = Math.min(SIZE - pos, 65536)
      if (!res.write(Buffer.allocUnsafe(len))) {
        await EE.once(res, 'drain')
      }
      pos += len
    }

    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)

      let pos = 0
      data.body.on('data', (buf) => {
        pos += buf.length
      })
      data.body.on('end', () => {
        t.equal(pos, SIZE)
      })
    })
  })
})
