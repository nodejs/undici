'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Response } = require('../..')

// https://github.com/nodejs/undici/issues/3760
test('filename* parameter is parsed properly', async (t) => {
  const response = new Response([
    '--83d82e0d-9ced-44c0-ac79-4e66a827415b\r\n' +
    'Content-Type: text/plain\r\n' +
    'Content-Disposition: form-data; name="file"; filename*=UTF-8\'\'%e2%82%ac%20rates\r\n' +
    '\r\n' +
    'testabc\r\n' +
    '--83d82e0d-9ced-44c0-ac79-4e66a827415b--\r\n' +
    '\r\n'
  ].join(''), {
    headers: {
      'content-type': 'multipart/form-data; boundary="83d82e0d-9ced-44c0-ac79-4e66a827415b"'
    }
  })

  const fd = await response.formData()
  assert.deepEqual(fd.get('file').name, '€ rates')
})

test('whitespace after filename[*]= is ignored', async () => {
  for (const response of [
    new Response([
      '--83d82e0d-9ced-44c0-ac79-4e66a827415b\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Disposition: form-data; name="file"; filename*=          utf-8\'\'hello\r\n' +
      '\r\n' +
      'testabc\r\n' +
      '--83d82e0d-9ced-44c0-ac79-4e66a827415b--\r\n' +
      '\r\n'
    ].join(''), {
      headers: {
        'content-type': 'multipart/form-data; boundary="83d82e0d-9ced-44c0-ac79-4e66a827415b"'
      }
    }),
    new Response([
      '--83d82e0d-9ced-44c0-ac79-4e66a827415b\r\n' +
      'Content-Type: text/plain\r\n' +
      'Content-Disposition: form-data; name="file"; filename=        "hello"\r\n' +
      '\r\n' +
      'testabc\r\n' +
      '--83d82e0d-9ced-44c0-ac79-4e66a827415b--\r\n' +
      '\r\n'
    ].join(''), {
      headers: {
        'content-type': 'multipart/form-data; boundary="83d82e0d-9ced-44c0-ac79-4e66a827415b"'
      }
    })
  ]) {
    const fd = await response.formData()
    assert.deepEqual(fd.get('file').name, 'hello')
  }
})
