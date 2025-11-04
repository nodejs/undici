'use strict'

const { createServer } = require('node:http')
const { test } = require('node:test')
const { fetch } = require('../..')

// https://github.com/nodejs/undici/issues/4647
test('fetch with mode: no-cors does not hang', async (t) => {
  const a = createServer((req, res) => {
    res.writeHead(200).end()
  }).listen(0)

  const b = createServer((req, res) => {
    res.writeHead(301, { Location: `http://localhost:${a.address().port}${req.url}` }).end()
  }).listen(0)

  t.after(() => {
    a.close()
    b.close()
  })

  await fetch(`http://localhost:${b.address().port}/abc`, { mode: 'no-cors' })
})
