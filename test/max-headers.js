'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')

test('handle a lot of headers', (t) => {
  t.plan(3)

  const headers = {}
  for (let n = 0; n < 64; ++n) {
    headers[n] = String(n)
  }

  const server = createServer((req, res) => {
    res.writeHead(200, headers)
    res.end()
  })
  t.teardown(server.close.bind(server))
  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.destroy.bind(client))

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)
      const headers2 = {}
      for (let n = 0; n < 64; ++n) {
        headers2[n] = data.headers[n]
      }
      t.strictDeepEqual(headers2, headers)
      data.body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })
  })
})
