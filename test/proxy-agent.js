'use strict'

const { test } = require('tap')
const { request, setGlobalDispatcher, getGlobalDispatcher } = require('..')
const { URL } = require('url')
const { InvalidArgumentError } = require('../lib/core/errors')
const ProxyAgent = require('../lib/proxy-agent')
const { createServer } = require('http')
const proxy = require('proxy')

test('should throw error when no uri is provided', (t) => {
  t.plan(2)
  t.throws(() => new ProxyAgent(), InvalidArgumentError)
  t.throws(() => new ProxyAgent({}), InvalidArgumentError)
})

test('should accept string and object as options', (t) => {
  t.plan(2)
  t.doesNotThrow(() => new ProxyAgent('http://example.com'))
  t.doesNotThrow(() => new ProxyAgent({ uri: 'http://example.com' }))
})

test('use proxy-agent to connect through proxy', async (t) => {
  t.plan(6)
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.on('request', () => {
    t.pass('should call proxy')
  })

  server.on('request', (req, res) => {
    t.equal(req.url, '/')
    t.equal(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await body.json()

  t.equal(statusCode, 200)
  t.same(json, { hello: 'world' })
  t.equal(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent to connect through proxy using path with params', async (t) => {
  t.plan(6)
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.on('request', () => {
    t.pass('should call proxy')
  })
  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    t.equal(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar', { dispatcher: proxyAgent })
  const json = await body.json()

  t.equal(statusCode, 200)
  t.same(json, { hello: 'world' })
  t.equal(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with auth', async (t) => {
  t.plan(7)
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.authenticate = function (req, fn) {
    t.pass('authentication should be called')
    fn(null, req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`)
  }
  proxy.on('request', () => {
    t.pass('proxy should be called')
  })

  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    t.equal(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(
    serverUrl + '/hello?foo=bar',
    {
      headers: {
        'proxy-authorization': `Basic ${Buffer.from('user:pass').toString('base64')}`
      },
      dispatcher: proxyAgent
    }
  )
  const json = await body.json()

  t.equal(statusCode, 200)
  t.same(json, { hello: 'world' })
  t.equal(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with setGlobalDispatcher', async (t) => {
  t.plan(6)
  const defaultDispatcher = getGlobalDispatcher()

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)
  setGlobalDispatcher(proxyAgent)

  t.teardown(() => setGlobalDispatcher(defaultDispatcher))

  proxy.on('request', () => {
    t.pass('should call proxy')
  })
  server.on('request', (req, res) => {
    t.equal(req.url, '/hello?foo=bar')
    t.equal(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar')
  const json = await body.json()

  t.equal(statusCode, 200)
  t.same(json, { hello: 'world' })
  t.equal(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

function buildServer () {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildProxy () {
  return new Promise((resolve) => {
    const server = proxy(createServer())
    server.listen(0, () => resolve(server))
  })
}
