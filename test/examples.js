'use strict'

const { createServer } = require('http')
const { test } = require('tap')
const examples = require('../examples/request.js')

test('request examples', async (t) => {
  let lastReq
  const exampleServer = createServer((req, res) => {
    lastReq = req
    if (req.method === 'DELETE') {
      res.statusCode = 204
      return res.end()
    } else if (req.method === 'POST') {
      res.statusCode = 200
      if (req.url === '/json') {
        res.end('{"hello":"JSON Response"}')
      } else {
        res.end('hello=form')
      }
    } else {
      res.statusCode = 200
      res.end('hello')
    }
  })

  t.teardown(exampleServer.close.bind(exampleServer))

  await exampleServer.listen(0)

  await examples.getRequest(exampleServer.address().port)
  t.equal(lastReq.method, 'GET')

  await examples.postJSONRequest(exampleServer.address().port)
  t.equal(lastReq.method, 'POST')
  t.equal(lastReq.headers['content-type'], 'application/json')

  await examples.postFormRequest(exampleServer.address().port)
  t.equal(lastReq.method, 'POST')
  t.equal(lastReq.headers['content-type'], 'application/x-www-form-urlencoded')

  await examples.deleteRequest(exampleServer.address().port)
  t.equal(lastReq.method, 'DELETE')

  t.end()
})
