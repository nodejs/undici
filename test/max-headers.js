'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { Client } = require('..')
const { createServer } = require('node:http')
const { once } = require('node:events')

test('handle a lot of headers', async (t) => {
  t = tspl(t, { plan: 3 })

  const headers = {}
  for (let n = 0; n < 64; ++n) {
    headers[n] = String(n)
  }

  const server = createServer((req, res) => {
    res.writeHead(200, headers)
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
    const headers2 = {}
    for (let n = 0; n < 64; ++n) {
      headers2[n] = data.headers[n]
    }
    t.deepStrictEqual(headers2, headers)
    data.body
      .resume()
      .on('end', () => {
        t.ok(true, 'pass')
      })
  })
  await t.completed
})
