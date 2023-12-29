'use strict'

const { test, skip, after } = require('node:test')
const { tspl } = require('@matteo.collina/tspl')
const { Readable } = require('stream')

let diagnosticsChannel

try {
  diagnosticsChannel = require('diagnostics_channel')
} catch {
  skip('missing diagnostics_channel')
  process.exit(0)
}

const { Client } = require('../..')
const { createServer } = require('http')

test('Diagnostics channel - post stream', (t) => {
  const assert = tspl(t, { plan: 33 })
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
  after(server.close.bind(server))

  const reqHeaders = {
    foo: undefined,
    bar: 'bar'
  }
  const body = Readable.from(['hello', ' ', 'world'])

  let _req
  diagnosticsChannel.channel('undici:request:create').subscribe(({ request }) => {
    _req = request
    assert.equal(request.completed, false)
    assert.equal(request.method, 'POST')
    assert.equal(request.path, '/')
    assert.equal(request.headers, 'bar: bar\r\n')
    request.addHeader('hello', 'world')
    assert.equal(request.headers, 'bar: bar\r\nhello: world\r\n')
    assert.deepStrictEqual(request.body, body)
  })

  let _connector
  diagnosticsChannel.channel('undici:client:beforeConnect').subscribe(({ connectParams, connector }) => {
    _connector = connector

    assert.equal(typeof _connector, 'function')
    assert.equal(Object.keys(connectParams).length, 6)

    const { host, hostname, protocol, port, servername } = connectParams

    assert.equal(host, `localhost:${server.address().port}`)
    assert.equal(hostname, 'localhost')
    assert.equal(port, String(server.address().port))
    assert.equal(protocol, 'http:')
    assert.equal(servername, null)
  })

  let _socket
  diagnosticsChannel.channel('undici:client:connected').subscribe(({ connectParams, socket, connector }) => {
    _socket = socket

    assert.equal(Object.keys(connectParams).length, 6)
    assert.equal(_connector, connector)

    const { host, hostname, protocol, port, servername } = connectParams

    assert.equal(host, `localhost:${server.address().port}`)
    assert.equal(hostname, 'localhost')
    assert.equal(port, String(server.address().port))
    assert.equal(protocol, 'http:')
    assert.equal(servername, null)
  })

  diagnosticsChannel.channel('undici:client:sendHeaders').subscribe(({ request, headers, socket }) => {
    assert.equal(_req, request)
    assert.equal(_socket, socket)

    const expectedHeaders = [
      'POST / HTTP/1.1',
      `host: localhost:${server.address().port}`,
      'connection: keep-alive',
      'bar: bar',
      'hello: world'
    ]

    assert.equal(headers, expectedHeaders.join('\r\n') + '\r\n')
  })

  diagnosticsChannel.channel('undici:request:headers').subscribe(({ request, response }) => {
    assert.equal(_req, request)
    assert.equal(response.statusCode, 200)
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
    assert.deepStrictEqual(response.headers, expectedHeaders)
    assert.equal(response.statusText, 'OK')
  })

  diagnosticsChannel.channel('undici:request:bodySent').subscribe(({ request }) => {
    assert.equal(_req, request)
  })

  let endEmitted = false

  return new Promise((resolve) => {
    diagnosticsChannel.channel('undici:request:trailers').subscribe(({ request, trailers }) => {
      assert.equal(request.completed, true)
      assert.equal(_req, request)
      // This event is emitted after the last chunk has been added to the body stream,
      // not when it was consumed by the application
      assert.equal(endEmitted, false)
      assert.deepStrictEqual(trailers, [Buffer.from('foo'), Buffer.from('oof')])
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
        assert.ok(!err)
        client.close()
        data.body.on('end', function () {
          endEmitted = true
        })
      })
    })
  })
})
