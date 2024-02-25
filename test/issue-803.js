'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')
const EE = require('node:events')

test('https://github.com/nodejs/undici/issues/803', async (t) => {
  t = tspl(t, { plan: 2 })

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
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  client.request({
    path: '/',
    method: 'GET'
  }, (err, data) => {
    t.ifError(err)

    let pos = 0
    data.body.on('data', (buf) => {
      pos += buf.length
    })
    data.body.on('end', () => {
      t.strictEqual(pos, SIZE)
    })
  })
  await t.completed
})
