'use strict'

const { createServer } = require('http')
const { test } = require('tap')
const { request, errors } = require('..')

test('should validate content-type CRLF Injection', (t) => {
  t.plan(2)

  const server = createServer((req, res) => {
    t.fail('should not receive any request')
    res.statusCode = 200
    res.end('hello')
  })

  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    try {
      await request(`http://localhost:${server.address().port}`, {
        method: 'GET',
        headers: {
          'content-type': 'application/json\r\n\r\nGET /foo2 HTTP/1.1'
        },
      })
      t.fail('request should fail')
    } catch (e) {
      t.type(e, errors.InvalidArgumentError)
      t.equal(e.message, 'invalid content-type header')
    }
  })
})
