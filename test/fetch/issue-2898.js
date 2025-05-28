'use strict'

const assert = require('node:assert')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/2898
test('421 requests with a body work as expected', async (t) => {
  const expected = 'This is a 421 Misdirected Request response.'

  const server = createServer((req, res) => {
    res.statusCode = 421
    res.end(expected)
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  for (const body of [
    'hello',
    new Uint8Array(Buffer.from('helloworld', 'utf-8'))
  ]) {
    const response = await fetch(`http://localhost:${server.address().port}`, {
      method: 'POST',
      body
    })

    assert.deepStrictEqual(response.status, 421)
    assert.deepStrictEqual(await response.text(), expected)
  }
})
