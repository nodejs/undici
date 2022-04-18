'use strict'

const t = require('tap')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  t.skip('missing diagnostics_channel')
  process.exit(0)
}

const { request } = require('../..')
const { createServer } = require('http')

t.plan(8)

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain')
  res.write('hello')
  res.end()
})
t.teardown(server.close.bind(server))

diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
  t.notOk('bodyReceived' in request)
})

diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ request }) => {
  t.notOk('bodyReceived' in request)
})

diagnosticsChannel.channel('undici:request:headers').subscribe(({ request }) => {
  t.notOk('bodyReceived' in request)
})

diagnosticsChannel.channel('undici:request:trailers').subscribe(({ request }) => {
  t.ok('bodyReceived' in request)
  t.ok(Array.isArray(request.bodyReceived))
  t.ok(request.bodyReceived.every(buffer => Buffer.isBuffer(buffer)))
  t.equal(Buffer.concat(request.bodyReceived).toString(), 'hello')
})

server.listen(0, async () => {
  const { body } = await request(`http://localhost:${server.address().port}`)
  t.equal(await body.text(), 'hello')
})
