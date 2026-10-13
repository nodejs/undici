'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')

// https://fetch.spec.whatwg.org/#simple-range-header-value
// Step 18: "If rangeStartValue and rangeEndValue are numbers, and
// rangeStartValue is greater than rangeEndValue, then return failure."
// An open-ended range such as `bytes=5-` has a null rangeEndValue and must
// not be rejected.
test('blob: fetch with an open-ended Range (bytes=N-) returns 206', async () => {
  const blob = new Blob(['hello world']) // 11 bytes
  const url = URL.createObjectURL(blob)

  const res = await fetch(url, { headers: { Range: 'bytes=5-' } })

  assert.strictEqual(res.status, 206)
  assert.strictEqual(await res.text(), 'hello world'.slice(5))
  assert.strictEqual(res.headers.get('Content-Range'), `bytes 5-10/${blob.size}`)
})
