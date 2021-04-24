'use strict'

const { test } = require('tap')
const { Client } = require('..')
const http = require('http')

test('end process on idle', (t) => {
  t.plan(2)

  const server = http.createServer((req, res) => {
    res.end()
  })
  server.keepAliveTimeout = 99999

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    client.request({ path: '/', method: 'GET' }, (err, { body }) => {
      t.error(err)
      body
        .resume()
        .on('end', () => {
          server.unref()
          setTimeout(() => {
            t.fail()
          }, 2e3).unref()
        })
    })
  })
})
