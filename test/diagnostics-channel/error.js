'use strict'

const { test, skip, after } = require('node:test')
const assert = require('node:assert')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  skip('missing diagnostics_channel')
  process.exit(0)
}

const { Client } = require('../..')
const { createServer } = require('http')

test('Diagnostics channel - error', () => {
  const server = createServer((req, res) => {
    res.destroy()
  })
  after(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }

  let _req
  diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
    _req = request
  })

  diagnosticsChannel.channel('undici:request:error').subscribe(({ request, error }) => {
    assert.equal(_req, request)
    assert.equal(error.code, 'UND_ERR_SOCKET')
  })

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      keepAliveTimeout: 300e3
    })

    client.request({
      path: '/',
      method: 'GET',
      headers: reqHeaders
    }, (err, data) => {
      assert.equal(err.code, 'UND_ERR_SOCKET')
      client.close()
    })
  })
})
