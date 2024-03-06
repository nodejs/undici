'use strict'

const assert = require('node:assert')
const { inspect } = require('node:util')
const { test } = require('node:test')
const { Response } = require('../..')

const input = Buffer.from([
  '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
  'Content-Disposition: form-data; ' +
   'name="upload_file_0"; filename="テスト.dat"',
  'Content-Type: application/octet-stream',
  '',
  'A'.repeat(1023),
  '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
].join('\r\n'))
const boundary = '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k'
const expected = [
  {
    type: 'file',
    name: 'upload_file_0',
    data: Buffer.from('A'.repeat(1023)),
    info: {
      filename: 'テスト.dat',
      encoding: '7bit',
      mimeType: 'application/octet-stream'
    }
  }
]

test('unicode filename', async (t) => {
  const response = new Response(input, {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`
    }
  })

  const fd = await response.formData()
  const results = []

  for (const [name, value] of fd) {
    if (typeof value === 'string') { // field
      results.push({
        type: 'field',
        name,
        val: value,
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      })
    } else { // File
      results.push({
        type: 'file',
        name,
        data: Buffer.from(await value.arrayBuffer()),
        info: {
          filename: value.name,
          encoding: '7bit',
          mimeType: value.type
        }
      })
    }
  }

  assert.deepStrictEqual(
    results,
    expected,
    'Results mismatch.\n' +
      `Parsed: ${inspect(results)}\n` +
      `Expected: ${inspect(expected)}`
  )
})
