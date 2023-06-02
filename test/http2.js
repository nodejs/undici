'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createSecureServer } = require('http2')
const pem = require('https-pem')

test('throw http2 not supported error', (t) => {
  t.plan(1)

  const server = createSecureServer({ key: pem.key, cert: pem.cert }, (req, res) => {
    res.stream.respond({ 'content-type': 'text/plain' })
    res.stream.end('hello')
  }).on('unknownProtocol', (socket) => {
    // continue sending data in http2 to our http1.1 client to trigger error
    socket.write('PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n')
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`https://localhost:${server.address().port}`, {
      tls: {
        rejectUnauthorized: false
      }
    })
    t.teardown(client.close.bind(client))

    client.request({ path: '/', method: 'GET' }, (err, data) => {
      t.type(err, errors.HTTPParserError)
    })
  })
})
