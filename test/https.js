'use strict'

const { test } = require('tap')
const { Client } = require('..')
const { createServer } = require('https')
const pem = require('https-pem')

test('https get with tls opts', (t) => {
  t.plan(6)

  const server = createServer(pem, (req, res) => {
    t.strictEqual('/', req.url)
    t.strictEqual('GET', req.method)
    res.setHeader('content-type', 'text/plain')
    res.end('hello')
  })
  t.tearDown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    t.tearDown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, { statusCode, headers, body }) => {
      t.error(err)
      t.strictEqual(statusCode, 200)
      t.strictEqual(headers['content-type'], 'text/plain')
      const bufs = []
      body.on('data', (buf) => {
        bufs.push(buf)
      })
      body.on('end', () => {
        t.strictEqual('hello', Buffer.concat(bufs).toString('utf8'))
      })
    })
  })
})
