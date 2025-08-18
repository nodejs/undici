'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Response } = require('../..')

// https://github.com/nodejs/undici/issues/3676
test('Leading and trailing CRLFs are ignored', async (t) => {
  const response = new Response([
    '--axios-1.7.7-boundary-bPgZ9x77LfApGVUN839vui4V7\r\n' +
    'Content-Disposition: form-data; name="file"; filename="doc.txt"\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n' +
    'Helloworld\r\n' +
    '--axios-1.7.7-boundary-bPgZ9x77LfApGVUN839vui4V7--\r\n' +
    '\r\n'
  ].join(''), {
    headers: {
      'content-type': 'multipart/form-data; boundary=axios-1.7.7-boundary-bPgZ9x77LfApGVUN839vui4V7'
    }
  })

  await assert.doesNotReject(response.formData())
})
