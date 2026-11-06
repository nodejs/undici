'use strict'

const { test } = require('node:test')
const { Request } = require('../..')

test('multipart formdata body containing the boundary token', async (t) => {
  t.plan(2)

  const boundary = '----formdata-undici-0.6204674738279623'
  // Both values embed the bare boundary token. It only marks a real delimiter
  // when it forms a "\r\n--boundary" line, so these bytes must stay in the body.
  const field = `a${boundary}b`
  const file = `--${boundary}--`

  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body:
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="field"\r\n' +
      '\r\n' +
      `${field}\r\n` +
      `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="f.txt"\r\n' +
      'Content-Type: text/plain\r\n' +
      '\r\n' +
      `${file}\r\n` +
      `--${boundary}--`
  })

  const form = await request.formData()
  t.assert.strictEqual(form.get('field'), field)
  t.assert.strictEqual(await form.get('file').text(), file)
})
