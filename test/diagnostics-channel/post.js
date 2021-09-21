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

t.plan(33)

const server = createServer((req, res) => {
  req.resume()
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('trailer', 'foo')
  res.write('hello')
  res.addTrailers({
    foo: 'oof'
  })
  res.end()
})
t.teardown(server.close.bind(server))

const reqHeaders = {
  foo: undefined,
  bar: 'bar'
}

let _req
diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
  _req = request
  t.equal(request.completed, false)
  t.equal(request.method, 'POST')
  t.equal(request.path, '/')
  t.equal(request.headers, 'bar: bar\r\n')
  request.addHeader('hello', 'world')
  t.equal(request.headers, 'bar: bar\r\nhello: world\r\n')
  t.same(request.body, Buffer.from('hello world'))
})

let _connector
diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(({ connectParams, connector }) => {
  _connector = connector

  t.equal(typeof _connector, 'function')
  t.equal(Object.keys(connectParams).length, 5)

  const { host, hostname, protocol, port, servername } = connectParams

  t.equal(host, `localhost:${server.address().port}`)
  t.equal(hostname, 'localhost')
  t.equal(port, String(server.address().port))
  t.equal(protocol, 'http:')
  t.equal(servername, null)
})

let _socket
diagnosticsChannel.channel('undici:client:connected').subscribe(({ connectParams, socket, connector }) => {
  _socket = socket

  t.equal(Object.keys(connectParams).length, 5)
  t.equal(_connector, connector)

  const { host, hostname, protocol, port, servername } = connectParams

  t.equal(host, `localhost:${server.address().port}`)
  t.equal(hostname, 'localhost')
  t.equal(port, String(server.address().port))
  t.equal(protocol, 'http:')
  t.equal(servername, null)
})

diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ request, headers, socket }) => {
  t.equal(_req, request)
  t.equal(_socket, socket)

  const expectedHeaders = [
    'POST / HTTP/1.1',
    `host: localhost:${server.address().port}`,
    'connection: keep-alive',
    'bar: bar',
    'hello: world'
  ]

  t.equal(headers, expectedHeaders.join('\r\n') + '\r\n')
})

diagnosticsChannel.channel('undici:request:headers').subscribe(({ request, response }) => {
  t.equal(_req, request)
  t.equal(response.statusCode, 200)
  const expectedHeaders = [
    Buffer.from('Content-Type'),
    Buffer.from('text/plain'),
    Buffer.from('trailer'),
    Buffer.from('foo'),
    Buffer.from('Date'),
    response.headers[5], // This is a date
    Buffer.from('Connection'),
    Buffer.from('keep-alive'),
    Buffer.from('Keep-Alive'),
    Buffer.from('timeout=5'),
    Buffer.from('Transfer-Encoding'),
    Buffer.from('chunked')
  ]
  t.same(response.headers, expectedHeaders)
  t.equal(response.statusText, 'OK')
})

diagnosticsChannel.channel('undici:request:bodySent').subscribe(({ request }) => {
  t.equal(_req, request)
})

let endEmitted = false
diagnosticsChannel.channel('undici:request:trailers').subscribe(({ request, trailers }) => {
  t.equal(request.completed, true)
  t.equal(_req, request)
  // This event is emitted after the last chunk has been added to the body stream,
  // not when it was consumed by the application
  t.equal(endEmitted, false)
  t.same(trailers, [Buffer.from('foo'), Buffer.from('oof')])
})

server.listen(0, () => {
  const client = new Client(`http://localhost:${server.address().port}`, {
    keepAliveTimeout: 300e3
  })
  t.teardown(client.close.bind(client))

  client.request({
    path: '/',
    method: 'POST',
    headers: reqHeaders,
    body: 'hello world'
  }, (err, data) => {
    t.error(err)
    data.body.on('end', function () {
      endEmitted = true
    })
  })
})
