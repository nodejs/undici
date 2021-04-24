'use strict'
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

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    request(`http://localhost:${server.address().port}`, (err, { body }) => {
      t.error(err)
      body
        .resume()
        .on('end', () => {
          console.error('end')
          setTimeout(() => {
            t.fail()
          }, 10e3).unref()
          t.pass()
        })
    })
  })
})
