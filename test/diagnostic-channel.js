'use strict'

const { test, skip } = require('tap')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  skip('missing diagnostics_channel')
  process.exit(0)
}

const { Client } = require('..')
const { createServer } = require('http')

test('channel undici:request:dispatch (get)', (t) => {
  t.plan(4)

  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })
  t.teardown(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  const createChannel = diagnosticsChannel.channel('undici:request:dispatch');

  createChannel.subscribe((request) => {
    t.equal(request.method, 'GET')
    t.equal(request.path, '/')
    t.same(request.headers, reqHeaders)
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })
    t.teardown(client.close.bind(client))

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      t.error(err)
      data.body.resume()
    })
  })
})
