'use strict'

const { test, after } = require('node:test')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client } = require('../../..')
const { createServer } = require('node:http')

test('Diagnostics channel - error', (t) => {
  t.plan(3)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
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
    t.assert.strictEqual(_req, request)
    t.assert.strictEqual(error.code, 'UND_ERR_SOCKET')
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
        t.assert.strictEqual(err.code, 'UND_ERR_SOCKET')
        client.close()
        resolve()
      })
    })
  })
})
