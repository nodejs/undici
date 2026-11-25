'use strict'

const { test } = require('node:test')
const { Request, Response } = require('..')

const boundary = 'undici-boundary-6112'
const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` }

for (const Type of [Request, Response]) {
  function parse (body) {
    const message = Type === Request
      ? new Request('http://localhost/', { method: 'POST', headers, body })
      : new Response(body, { headers })
    return message.formData()
  }

  test(`${Type.name}.formData() preserves boundary text inside a field`, async (t) => {
    for (const value of [
      '',
      boundary,
      `--${boundary}`,
      `text with ${boundary} inside`,
      `text with --${boundary} inside`,
      `first line\r\n${boundary} on another line`,
      'trailing line break\r\n'
    ]) {
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\n${value}\r\n--${boundary}--\r\n`
      const form = await parse(body)
      t.assert.strictEqual(form.get('field'), value)
    }
  })

  test(`${Type.name}.formData() preserves file bytes and finds the next part`, async (t) => {
    const content = Buffer.concat([
      Buffer.from([0, 255]),
      Buffer.from(`text with --${boundary} inside\r\n${boundary}`),
      Buffer.from([0, 255])
    ])
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="data.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\nafter file\r\n--${boundary}--\r\n`)
    ])
    const form = await parse(body)
    const file = form.get('file')
    t.assert.strictEqual(file.name, 'data.bin')
    t.assert.strictEqual(file.type, 'application/octet-stream')
    t.assert.deepStrictEqual(Buffer.from(await file.arrayBuffer()), content)
    t.assert.strictEqual(form.get('field'), 'after file')
  })

  test(`${Type.name}.formData() rejects a body without a boundary delimiter`, async (t) => {
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\ntext with ${boundary} inside`
    await t.assert.rejects(parse(body), TypeError)
  })
}
