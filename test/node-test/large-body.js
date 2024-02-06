'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { request } = require('../../')
const { strictEqual } = require('node:assert')

test('socket should not be reused unless body is consumed', async (t) => {
  const LARGE_BODY = 'x'.repeat(10000000)

  const server = createServer((req, res) => {
    if (req.url === '/foo') {
      res.end(LARGE_BODY)
      return
    }
    if (req.url === '/bar') {
      res.end('bar')
      return
    }
    throw new Error('Unexpected request url: ' + req.url)
  })

  await new Promise((resolve) => { server.listen(0, resolve) })
  t.after(() => { server.close() })

  // Works fine
  // const fooRes = await request('http://localhost:3000/foo')
  // const fooBody = await fooRes.body.text()

  // const barRes = await request('http://localhost:3000/bar')
  // await barRes.body.text()

  const port = server.address().port

  // Fails with:
  const fooRes = await request(`http://localhost:${port}/foo`)
  const barRes = await request(`http://localhost:${port}/bar`)

  const fooBody = await fooRes.body.text()
  await barRes.body.text()

  strictEqual(fooRes.headers['content-length'], String(LARGE_BODY.length))
  strictEqual(fooBody.length, LARGE_BODY.length)
  strictEqual(fooBody, LARGE_BODY)
})
