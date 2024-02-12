'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { once } = require('node:events')
const { Client } = require('..')
const { createServer } = require('node:http')

test('CRLF Injection in Nodejs ‘undici’ via host', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer(async (req, res) => {
    res.end()
  })
  after(() => server.close())

  server.listen(0)

  await once(server, 'listening')

  const client = new Client(`http://localhost:${server.address().port}`)
  after(() => client.close())

  const unsanitizedContentTypeInput = '12 \r\n\r\naaa:aaa'

  try {
    const { body } = await client.request({
      path: '/',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        host: unsanitizedContentTypeInput
      },
      body: 'asd'
    })
    await body.dump()
  } catch (err) {
    t.strictEqual(err.code, 'UND_ERR_INVALID_ARG')
  }
  await t.completed
})
