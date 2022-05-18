'use strict'

const t = require('tap')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  t.skip('missing diagnostics_channel')
  process.exit(0)
}

const { Client } = require('../..')
const { createServer } = require('http')

t.plan(3)

const server = createServer((req, res) => {
  res.destroy()
})
t.teardown(server.close.bind(server))

const reqHeaders = {
  foo: undefined,
  bar: 'bar'
}

let _req
diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
  _req = request
})

diagnosticsChannel.channel('undici:request:error').subscribe(({ request, error }) => {
  t.equal(_req, request)
  t.equal(error.code, 'UND_ERR_SOCKET')
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
    t.equal(err.code, 'UND_ERR_SOCKET')
  })
})
