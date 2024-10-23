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

test('Multiple leading CRLFs cause failure without handling', async () => {
  const response = new Response([
    '\r\n\r\n' +  // Multiple leading CRLFs
    '--axios-1.7.7-boundary-multipleLeading\r\n' +
    'Content-Disposition: form-data; name="file"; filename="doc.txt"\r\n' +
    'Content-Type: text/plain\r\n' +
    '\r\n' +
    'Hello World\r\n' +
    '--axios-1.7.7-boundary-multipleLeading--\r\n'
  ].join(''), {
    headers: {
      'content-type': 'multipart/form-data; boundary=axios-1.7.7-boundary-multipleLeading'
    }
  })

  await assert.rejects(response.formData(), {
    name: 'TypeError',
    message: 'Failed to parse body as FormData'
  })
})

test('Missing Content-Type header causes failure', async () => {
  const response = new Response([
    '--axios-1.7.7-boundary-missingContentType\r\n' +
    'Content-Disposition: form-data; name="file"; filename="doc.txt"\r\n' +
    // Missing Content-Type header
    '\r\n' +
    'Hello World\r\n' +
    '--axios-1.7.7-boundary-missingContentType--\r\n'
  ].join(''), {
    headers: {
      'content-type': 'multipart/form-data; boundary=axios-1.7.7-boundary-missingContentType'
    }
  })

  await assert.rejects(response.formData(), {
    name: 'TypeError',
    message: 'Failed to parse body as FormData'
  })
})

test('Invalid Content-Type causes failure', async () => {
  const response = new Response([
    '--axios-1.7.7-boundary-invalidContentType\r\n' +
    'Content-Disposition: form-data; name="file"; filename="doc.txt"\r\n' +
    'Content-Type: invalid/type\r\n' +  // Invalid Content-Type
    '\r\n' +
    'Hello World\r\n' +
    '--axios-1.7.7-boundary-invalidContentType--\r\n'
  ].join(''), {
    headers: {
      'content-type': 'multipart/form-data; boundary=axios-1.7.7-boundary-invalidContentType'
    }
  })

  await assert.rejects(response.formData(), {
    name: 'TypeError',
    message: 'Failed to parse body as FormData'
  })
})
