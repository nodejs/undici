'use strict'

const { test } = require('node:test')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { fetch, FormData } = require('../..')

// https://github.com/nodejs/undici/issues/4065
test('multipart/form-data boundary is stable across a 307 redirect', async (t) => {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/first') {
      res.writeHead(307, {
        Location: `http://localhost:${server.address().port}/second`
      })
      res.end()
      return
    }

    if (req.method === 'POST' && req.url === '/second') {
      res.setHeader('content-type', req.headers['content-type'])
      req.pipe(res).on('end', () => res.end())
    }
  }).listen(0)

  t.after(server.close.bind(server))
  await once(server, 'listening')

  const formData = new FormData()
  formData.append('test', 'data')

  const response = await fetch(`http://localhost:${server.address().port}/first`, {
    method: 'POST',
    body: formData,
    redirect: 'follow'
  })

  await t.assert.doesNotReject(response.formData())
})
