'use strict'

const { test, after } = require('node:test')
const { Readable } = require('node:stream')
const diagnosticsChannel = require('node:diagnostics_channel')
const { Client } = require('../../..')
const { createServer } = require('node:http')

test('Diagnostics channel - post stream', (t) => {
  t.plan(43)
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.resume()
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('trailer', 'foo')
    res.write('hello')
    res.addTrailers({
      foo: 'oof'
    })
    res.end()
  })
  after(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }
  const body = Readable.from(['hello', ' ', 'world'])

  let _req
  diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
    _req = request
    t.assert.strictEqual(request.completed, false)
    t.assert.strictEqual(request.method, 'POST')
    t.assert.strictEqual(request.path, '/')
    t.assert.deepStrictEqual(request.headers, ['bar', 'bar'])
    request.addHeader('hello', 'world')
    t.assert.deepStrictEqual(request.headers, ['bar', 'bar', 'hello', 'world'])
    t.assert.deepStrictEqual(request.body, body)
  })

  let _connector
  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(({ connectParams, connector }) => {
    _connector = connector

    t.assert.strictEqual(typeof _connector, 'function')
    t.assert.strictEqual(Object.keys(connectParams).length, 7)

    const { host, hostname, protocol, port, servername } = connectParams

    t.assert.strictEqual(host, `localhost:${server.address().port}`)
    t.assert.strictEqual(hostname, 'localhost')
    t.assert.strictEqual(port, String(server.address().port))
    t.assert.strictEqual(protocol, 'http:')
    t.assert.strictEqual(servername, null)
  })

  let _socket
  diagnosticsChannel.channel('undici:client:connected').subscribe(({ connectParams, socket, connector }) => {
    _socket = socket

    t.assert.strictEqual(Object.keys(connectParams).length, 7)
    t.assert.strictEqual(_connector, connector)

    const { host, hostname, protocol, port, servername } = connectParams

    t.assert.strictEqual(host, `localhost:${server.address().port}`)
    t.assert.strictEqual(hostname, 'localhost')
    t.assert.strictEqual(port, String(server.address().port))
    t.assert.strictEqual(protocol, 'http:')
    t.assert.strictEqual(servername, null)
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ request, headers, socket }) => {
    t.assert.strictEqual(_req, request)
    t.assert.strictEqual(_socket, socket)

    const expectedHeaders = [
      'POST / HTTP/1.1',
      `host: localhost:${server.address().port}`,
      'connection: keep-alive',
      'bar: bar',
      'hello: world'
    ]

    t.assert.strictEqual(headers, expectedHeaders.join('\r\n') + '\r\n')
  })

  diagnosticsChannel.channel('undici:request:headers').subscribe(({ request, response }) => {
    t.assert.strictEqual(_req, request)
    t.assert.strictEqual(response.statusCode, 200)
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
    t.assert.deepStrictEqual(response.headers, expectedHeaders)
    t.assert.strictEqual(response.statusText, 'OK')
  })

  let bodySent = false
  const bodyChunks = []
  diagnosticsChannel.channel('undici:request:bodyChunkSent').subscribe(({ request, chunk }) => {
    t.assert.strictEqual(_req, request)
    // Chunk can be a string or a Buffer, depending on the stream writer.
    t.assert.strictEqual(typeof chunk, 'string')
    bodyChunks.push(Buffer.from(chunk))
  })
  diagnosticsChannel.channel('undici:request:bodySent').subscribe(({ request }) => {
    t.assert.strictEqual(_req, request)
    bodySent = true

    const requestBody = Buffer.concat(bodyChunks)
    t.assert.deepStrictEqual(requestBody, Buffer.from('hello world'))
  })

  let endEmitted = false

  return new Promise((resolve) => {
    const respChunks = []
    diagnosticsChannel.channel('undici:request:bodyChunkReceived').subscribe(({ request, chunk }) => {
      t.assert.strictEqual(_req, request)
      respChunks.push(chunk)
    })

    diagnosticsChannel.channel('undici:request:trailers').subscribe(({ request, trailers }) => {
      t.assert.strictEqual(bodySent, true)
      t.assert.strictEqual(request.completed, true)
      t.assert.strictEqual(_req, request)
      // This event is emitted after the last chunk has been added to the body stream,
      // not when it was consumed by the application
      t.assert.strictEqual(endEmitted, false)
      t.assert.deepStrictEqual(trailers, [Buffer.from('foo'), Buffer.from('oof')])

      const respData = Buffer.concat(respChunks)
      t.assert.deepStrictEqual(respData, Buffer.from('hello'))

      resolve()
    })

    server.listen(0, () => {
      const client = new Client(`http://localhost:${server.address().port}`, {
        keepAliveTimeout: 300e3
      })

      client.request({
        path: '/',
        method: 'POST',
        headers: reqHeaders,
        body
      }, (err, data) => {
        t.assert.ok(!err)
        client.close()
        data.body.on('end', function () {
          endEmitted = true
        })
      })
    })
  })
})
