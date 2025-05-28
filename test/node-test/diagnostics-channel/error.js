'use strict'

const { test, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client } = require('../../..')
const { createServer } = require('node:http')

test('Diagnostics channel - error', (t) => {
  const assert = tspl(t, { plan: 3 })
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

  return new Promise((resolve) => {
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
        resolve()
      })
    })
  })
})
