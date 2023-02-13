'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('http')
const EE = require('events')

test('CRLF Injection in Nodejs ‘undici’ via host', (t) => {
  t.plan(1)

  const server = createServer(async (req, res) => {
    res.end()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, async () => {
    const client = new Client(`http://localhost:${server.address().port}`)
    t.teardown(client.close.bind(client))

    const unsanitizedContentTypeInput =  '12 \r\n\r\naaa:aaa'

    try {
      const { body } = await client.request({
        path: '/',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'host': unsanitizedContentTypeInput
        },
        body: 'asd'
      })
      await body.dump()
    } catch (err) {
      t.same(err.code, 'UND_ERR_INVALID_ARG')
    }
  })
})
