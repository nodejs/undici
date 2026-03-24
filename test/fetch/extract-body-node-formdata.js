'use strict'

const { createServer } = require('node:http')
const { once } = require('node:events')
const { test } = require('node:test')
const { extractBody } = require('../../lib/web/fetch/body')
const { FormData: UndiciFormData, request } = require('../..')

test('extractBody sets multipart content-type for Node global FormData', (t) => {
  const fd = new globalThis.FormData()
  fd.append('key', 'value')

  t.assert.strictEqual(fd instanceof UndiciFormData, false)

  const [, contentType] = extractBody(fd)
  t.assert.ok(contentType != null)
  t.assert.match(contentType, /^multipart\/form-data; boundary=/)
})

test('request sends multipart Content-Type for Node global FormData body', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.match(
      req.headers['content-type'],
      /^multipart\/form-data; boundary=/
    )
    res.end()
  }).listen(0)

  t.after(() => server.close())
  await once(server, 'listening')

  const fd = new globalThis.FormData()
  fd.append('a', 'b')
  t.assert.strictEqual(fd instanceof UndiciFormData, false)

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body: fd
  })
})
