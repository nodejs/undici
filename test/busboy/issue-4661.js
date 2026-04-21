'use strict'

const { test } = require('node:test')
const { Request } = require('../..')

const boundary = '1df6c75e-c5a7-486c-af47-67b632b19522'
const contentType = `multipart/form-data; boundary=${boundary}`

// https://github.com/nodejs/undici/issues/4661
test('content-disposition allows both filename and filename* parameters', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="Abc"; filename="E 1962 029 1342-0003.JPG"; filename*=utf-8\'\'E%201962%20029%201342-0003.JPG\r\n' +
      '\r\n' +
      'Hello\r\n' +
      `--${boundary}--`
  })

  const fd = await request.formData()
  const file = fd.get('Abc')
  t.assert.ok(file instanceof File)
  t.assert.strictEqual(file.name, 'E 1962 029 1342-0003.JPG')
  t.assert.strictEqual(await file.text(), 'Hello')
})

test('filename* (RFC 5987) without legacy filename is parsed correctly', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="Abc"; filename*=utf-8\'\'only-extended.txt\r\n' +
      '\r\n' +
      'Hello\r\n' +
      `--${boundary}--`
  })

  const fd = await request.formData()
  const file = fd.get('Abc')
  t.assert.ok(file instanceof File)
  t.assert.strictEqual(file.name, 'only-extended.txt')
})

test('filename* takes precedence over filename when both are present', async (t) => {
  // Per RFC 5987 §4.1, when both extended and non-extended forms of the
  // same parameter appear, the extended form is preferred regardless of order.
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="Abc"; filename*=utf-8\'\'extended.txt; filename="legacy.txt"\r\n' +
      '\r\n' +
      'Hello\r\n' +
      `--${boundary}--`
  })

  const fd = await request.formData()
  const file = fd.get('Abc')
  t.assert.ok(file instanceof File)
  t.assert.strictEqual(file.name, 'extended.txt')
})

test('filename* takes precedence when filename appears first', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="Abc"; filename="legacy.txt"; filename*=utf-8\'\'extended.txt\r\n' +
      '\r\n' +
      'Hello\r\n' +
      `--${boundary}--`
  })

  const fd = await request.formData()
  const file = fd.get('Abc')
  t.assert.ok(file instanceof File)
  t.assert.strictEqual(file.name, 'extended.txt')
})

test('filename* with percent-encoded UTF-8 bytes is decoded', async (t) => {
  // %E2%82%AC = U+20AC (€), %20 = space
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="Abc"; filename*=UTF-8\'\'%E2%82%AC%20rates.txt\r\n' +
      '\r\n' +
      'Hello\r\n' +
      `--${boundary}--`
  })

  const fd = await request.formData()
  const file = fd.get('Abc')
  t.assert.ok(file instanceof File)
  t.assert.strictEqual(file.name, '\u20AC rates.txt')
})
