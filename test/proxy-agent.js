'use strict'

const { test } = require('tap')
const { request } = require('..')
const ProxyAgent = require('../lib/proxy-agent')
const { createServer } = require('http')
const proxy = require('proxy')

test('connect through proxy', async (t) => {
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl);


  server.on('request', (req, res) => {
    t.equal(req.url, '/')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    trailers,
    body
  } = await request(serverUrl)
  const json = await body.json()

  t.equal(statusCode, 200)
  t.same(json, { hello: 'world' })

  server.close()
  proxy.close()
  proxyAgent.close()
})

function buildServer () {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildProxy () {
  return new Promise((resolve, reject) => {
    const server = proxy(createServer())
    server.listen(0, () => resolve(server))
  })
}
