'use strict'

const { test } = require('tap')
const { once } = require('events')
const { createServer } = require('http')
const { Client } = require('..')

test('dont crash on unexpected Transfer-Encoding Header', async (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.removeHeader('Connection')
    res.removeHeader('Keep-Alive')
    res.removeHeader('Transfer-Encoding')
    const str = 'Chunked Transfer Encoding Test'
    res.write(str.repeat(832))
    res.end(str)
  })
  t.teardown(server.close.bind(server))

  server.listen(0)

  await once(server, 'listening')
  const client = new Client(`http://localhost:${server.address().port}`)
  t.teardown(client.close.bind(client))

  const { body } = await client.request({
    path: '/',
    method: 'GET'
  })
  t.pass('request successful')

  body.resume()
})
