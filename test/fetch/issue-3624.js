'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch, FormData } = require('../..')

// https://github.com/nodejs/undici/issues/3624
test('crlf is appended to formdata body (issue #3624)', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    req.pipe(res)
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const fd = new FormData()
  fd.set('a', 'b')
  fd.set('c', new File(['d'], 'd.txt.exe'), 'd.txt.exe')

  const response = await fetch(`http://localhost:${server.address().port}`, {
    body: fd,
    method: 'POST'
  })

  t.assert.ok((await response.text()).endsWith('\r\n'))
})
