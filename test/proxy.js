'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { Client, Pool } = require('..')
const { createServer } = require('node:http')
const { createProxy } = require('proxy')

test('connect through proxy', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const client = new Client(proxyUrl)

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar'
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.strictEqual(response.statusCode, 200)
  t.deepStrictEqual(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  client.close()
})

test('connect through proxy with auth', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req) {
    return req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`
  }

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const client = new Client(proxyUrl)

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar',
    headers: {
      'proxy-authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`
    }
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.strictEqual(response.statusCode, 200)
  t.deepStrictEqual(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  client.close()
})

test('connect through proxy with auth but invalid credentials', async (t) => {
  t = tspl(t, { plan: 1 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req) {
    return req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:no-pass').toString('base64')}`
  }

  server.on('request', (req, res) => {
    t.fail('should not be called')
  })

  const client = new Client(proxyUrl)

  const response = await client.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar',
    headers: {
      'proxy-authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`
    }
  })

  t.strictEqual(response.statusCode, 407)

  server.close()
  proxy.close()
  client.close()
})

test('connect through proxy (with pool)', async (t) => {
  t = tspl(t, { plan: 3 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const pool = new Pool(proxyUrl)

  const response = await pool.request({
    method: 'GET',
    path: serverUrl + '/hello?foo=bar'
  })

  response.body.setEncoding('utf8')
  let data = ''
  for await (const chunk of response.body) {
    data += chunk
  }
  t.strictEqual(response.statusCode, 200)
  t.deepStrictEqual(JSON.parse(data), { hello: 'world' })

  server.close()
  proxy.close()
  pool.close()
})

function buildServer () {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildProxy () {
  return new Promise((resolve, reject) => {
    const server = createProxy(createServer())
    server.listen(0, () => resolve(server))
  })
}
