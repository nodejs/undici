'use strict'

const { test } = require('tap')
const { request } = require('..')
const http = require('http')

test('end process on idle', (t) => {
  t.plan(3)

  const server = http.createServer((req, res) => {
    res.end()
  })
  server.keepAliveTimeout = 99999

  server.listen(0, async () => {
    request(`http://localhost:${server.address().port}`, (err, { body }) => {
      t.error(err)
      body
        .resume()
        .on('end', () => {
          server.unref()
          setTimeout(() => {
            t.fail()
          }, 1e3).unref()
          t.pass()
        })
    })
  })
})
