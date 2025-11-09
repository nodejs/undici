'use strict'

const { test } = require('node:test')
const { Request } = require('../..')

// https://github.com/nodejs/undici/issues/4660
test('unquoted attributes are parsed correctly', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=7427efb8-6ce7-4740-9198-d90399842641'
    },
    body:
      '--7427efb8-6ce7-4740-9198-d90399842641\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Content-Disposition: form-data; name=test\r\n' +
      '\r\n' +
      'abc\r\n' +
      '--7427efb8-6ce7-4740-9198-d90399842641--'
  })

  const fd = await request.formData()
  t.assert.deepEqual(fd.get('test'), 'abc')
})

test('leading spaces are allowed with quoted strings', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=7427efb8-6ce7-4740-9198-d90399842641'
    },
    body:
      '--7427efb8-6ce7-4740-9198-d90399842641\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Content-Disposition: form-data; name=           "test"\r\n' + // <-- space between attribute name and value
      '\r\n' +
      'abc\r\n' +
      '--7427efb8-6ce7-4740-9198-d90399842641--'
  })

  const fd = await request.formData()
  t.assert.deepEqual(fd.get('test'), 'abc')
})

test('leading spaces are allowed & ignored in unquoted strings', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=7427efb8-6ce7-4740-9198-d90399842641'
    },
    body:
      '--7427efb8-6ce7-4740-9198-d90399842641\r\n' +
      'Content-Type: text/plain; charset=utf-8\r\n' +
      'Content-Disposition: form-data; name=           test\r\n' + // <-- space between attribute name and value
      '\r\n' +
      'abc\r\n' +
      '--7427efb8-6ce7-4740-9198-d90399842641--'
  })

  const fd = await request.formData()
  t.assert.deepEqual(fd.get('test'), 'abc')
})
