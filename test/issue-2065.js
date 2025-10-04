'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { FormData, request } = require('..')

test('undici.request with a FormData body should set content-length header', async (t) => {
  t.plan(1)

  const server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
    t.assert.ok(req.headers['content-length'])
    res.end()
  }).listen(0)

  after(() => server.close())
  await once(server, 'listening')

  const body = new FormData()
  body.set('file', new File(['abc'], 'abc.txt'))

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })
})
