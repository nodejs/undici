'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { openAsBlob } = require('node:fs')
const { File, FormData, request } = require('..')

test('undici.request with a FormData body should set content-length header', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    t.ok(req.headers['content-length'])
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

test('undici.request with a FormData stream value should set transfer-encoding header', { skip: !openAsBlob }, async (t) => {
  const { ok } = tspl(t, { plan: 1 })

  const server = createServer((req, res) => {
    ok(req.headers['content-type'].startsWith('multipart/form-data'))
    res.end()
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const body = new FormData()
  body.set('file', await openAsBlob(__filename), 'streamfile')

  await request(`http://localhost:${server.address().port}`, {
    method: 'POST',
    body
  })
})
