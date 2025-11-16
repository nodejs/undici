'use strict'

const { test } = require('node:test')
const { Request, Response, FormData } = require('../..')

// https://github.com/nodejs/undici/issues/4671
test('preamble and epilogue is ignored', async (t) => {
  const request = new Request('https://example.com', {
    method: 'POST',
    body: (function () {
      const formData = new FormData()
      formData.append('a', 'b')
      return formData
    })()
  })

  const contentType = request.headers.get('Content-Type')
  let bytes = await request.bytes()
  bytes = new Uint8Array(bytes.buffer.transfer(bytes.length + 10))

  await t.test('epilogue', async () => {
    await new Response(bytes, {
      headers: {
        'Content-Type': contentType
      }
    }).formData()
  })

  await t.test('preamble', async () => {
    // preamble
    bytes.set(bytes.subarray(0, -10), 10)
    bytes.fill(0, 0, 8)
    bytes[8] = 13
    bytes[9] = 10

    await new Response(bytes, {
      headers: {
        'Content-Type': contentType
      }
    }).formData()
  })
})
