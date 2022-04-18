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

t.plan(5)

const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'text/plain')
  res.write('hello')
  res.end()
})
t.teardown(server.close.bind(server))

diagnosticsChannel.channel('undici:request:trailers').subscribe(({ response }) => {
  t.ok('body' in response)
  t.ok(Array.isArray(response.body))
  t.ok(response.body.every(buffer => Buffer.isBuffer(buffer)))
  t.equal(Buffer.concat(response.body).toString(), 'hello')
})

server.listen(0, async () => {
  const { body } = await request(`http://localhost:${server.address().port}`)
  t.equal(await body.text(), 'hello')
})
