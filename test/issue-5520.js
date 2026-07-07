'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { createServer: createH2Server } = require('node:http2')
const { once } = require('node:events')
const { request, FormData: UndiciFormData, H2CClient, errors } = require('..')

// https://github.com/nodejs/undici/issues/5520
// request() accepts FormData bodies via a duck-typed check
// (util.isFormDataLike), but only undici's own FormData can be encoded.
// Instances from other realms (e.g. Node.js' builtin globalThis.FormData)
// used to fall through the brand-checked extraction and were dispatched as
// a body that never produced any bytes, hanging the request until an
// external timeout. They are now rejected upfront with InvalidArgumentError.

function createEchoServer (t) {
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        contentType: req.headers['content-type'] ?? null,
        contentLength: req.headers['content-length'] ?? null,
        body: Buffer.concat(chunks).toString('utf8')
      }))
    })
  })
  t.after(() => {
    server.closeAllConnections?.()
    server.close()
  })
  return server
}

test('request() rejects a cross-realm (Node builtin) FormData body', { timeout: 60000 }, async (t) => {
  // The premise of the test: the global FormData is not undici's own class.
  t.assert.notStrictEqual(globalThis.FormData, UndiciFormData)

  const server = createEchoServer(t)
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

test('request() rejects a string-only cross-realm FormData body', { timeout: 60000 }, async (t) => {
  const server = createEchoServer(t)
  server.listen(0)
  await once(server, 'listening')

  const form = new globalThis.FormData()
  form.append('a', '1')

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

test('request() still encodes undici\'s own FormData body', { timeout: 60000 }, async (t) => {
  const server = createEchoServer(t)
  server.listen(0)
  await once(server, 'listening')

  const form = new UndiciFormData()
  form.append('field', 'value with spaces')
  form.append('file', new Blob(['file contents'], { type: 'text/plain' }), 'hello.txt')

  const res = await request(`http://localhost:${server.address().port}/`, {
    method: 'POST',
    body: form
  })
  const echo = await res.body.json()

  t.assert.strictEqual(res.statusCode, 200)
  const boundary = /^multipart\/form-data; boundary=(\S+)$/.exec(echo.contentType)?.[1]
  t.assert.ok(boundary, `expected multipart content-type, got ${echo.contentType}`)
  t.assert.strictEqual(echo.contentLength, String(Buffer.byteLength(echo.body)))
  t.assert.ok(echo.body.includes('Content-Disposition: form-data; name="field"\r\n\r\nvalue with spaces\r\n'))
  t.assert.ok(echo.body.includes('Content-Disposition: form-data; name="file"; filename="hello.txt"'))
  t.assert.ok(echo.body.includes('file contents'))
  t.assert.ok(echo.body.endsWith(`--${boundary}--\r\n`))
})

test('HTTP/2 client still encodes undici\'s own FormData body', { timeout: 60000 }, async (t) => {
  const server = createH2Server((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        contentType: req.headers['content-type'] ?? null,
        body: Buffer.concat(chunks).toString('utf8')
      }))
    })
  })
  t.after(() => server.close())

  server.listen(0)
  await once(server, 'listening')

  const client = new H2CClient(`http://localhost:${server.address().port}`)
  t.after(() => client.close())

  const form = new UndiciFormData()
  form.append('file', new Blob(['file contents'], { type: 'text/plain' }), 'hello.txt')

  const res = await client.request({ path: '/', method: 'POST', body: form })
  const echo = await res.body.json()

  t.assert.strictEqual(res.statusCode, 200)
  t.assert.ok(echo.body.includes('Content-Disposition: form-data; name="file"; filename="hello.txt"'))
  t.assert.ok(echo.body.includes('file contents'))
})
