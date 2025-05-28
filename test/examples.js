'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { createServer } = require('node:http')
const { test, after } = require('node:test')
const { once } = require('node:events')
const examples = require('../docs/examples/request.js')

test('request examples', async (t) => {
  t = tspl(t, { plan: 7 })

  let lastReq
  const exampleServer = createServer((req, res) => {
    lastReq = req
    if (req.method === 'DELETE') {
      res.statusCode = 204
      return res.end()
    } else if (req.method === 'POST') {
      res.statusCode = 200
      if (req.url === '/json') {
        res.setHeader('content-type', 'application/json')
        res.end('{"hello":"JSON Response"}')
      } else {
        res.end('hello=form')
      }
    } else {
      res.statusCode = 200
      res.end('hello')
    }
  })

  const errorServer = createServer((req, res) => {
    lastReq = req
    res.statusCode = 400
    res.setHeader('content-type', 'application/json')
    res.end('{"error":"an error"}')
  })

  after(() => exampleServer.close())
  after(() => errorServer.close())

  exampleServer.listen(0)
  errorServer.listen(0)

  await Promise.all([
    once(exampleServer, 'listening'),
    once(errorServer, 'listening')
  ])

  await examples.getRequest(exampleServer.address().port)
  t.strictEqual(lastReq.method, 'GET')

  await examples.postJSONRequest(exampleServer.address().port)
  t.strictEqual(lastReq.method, 'POST')
  t.strictEqual(lastReq.headers['content-type'], 'application/json')

  await examples.postFormRequest(exampleServer.address().port)
  t.strictEqual(lastReq.method, 'POST')
  t.strictEqual(lastReq.headers['content-type'], 'application/x-www-form-urlencoded')

  await examples.deleteRequest(exampleServer.address().port)
  t.strictEqual(lastReq.method, 'DELETE')

  await examples.deleteRequest(errorServer.address().port)
  t.strictEqual(lastReq.method, 'DELETE')

  await t.completed
})
