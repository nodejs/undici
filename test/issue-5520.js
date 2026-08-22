'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { createServer: createH2Server } = require('node:http2')
const { once } = require('node:events')
const { request, H2CClient, errors } = require('..')

// https://github.com/nodejs/undici/issues/5520

test('request() rejects a cross-realm (Node builtin) FormData body', { timeout: 60000 }, async (t) => {
  const server = createServer((req, res) => {
    req.on('data', () => {})
    req.on('end', () => res.end('{}'))
  })
  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  server.listen(0)
  await once(server, 'listening')

  const form = new globalThis.FormData()
  form.append('field', 'value')
  form.append('file', new Blob(['file contents'], { type: 'text/plain' }), 'hello.txt')

  await t.assert.rejects(
    request(`http://localhost:${server.address().port}/`, { method: 'POST', body: form }),
    errors.InvalidArgumentError
  )
})

test('HTTP/2 client rejects a cross-realm (Node builtin) FormData body', { timeout: 60000 }, async (t) => {
  const server = createH2Server((req, res) => {
    req.on('data', () => {})
    req.on('end', () => res.end('{}'))
  })
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const client = new H2CClient(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  const form = new globalThis.FormData()
  form.append('field', 'value')

  await t.assert.rejects(
    client.request({ path: '/', method: 'POST', body: form }),
    errors.InvalidArgumentError
  )
})
