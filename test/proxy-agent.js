'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { request, fetch, setGlobalDispatcher, getGlobalDispatcher } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const ProxyAgent = require('../lib/proxy-agent')
const Pool = require('../lib/pool')
const { createServer } = require('node:http')
const https = require('node:https')
const proxy = require('proxy')

test('should throw error when no uri is provided', (t) => {
  t = tspl(t, { plan: 2 })
  t.throws(() => new ProxyAgent(), InvalidArgumentError)
  t.throws(() => new ProxyAgent({}), InvalidArgumentError)
})

test('using auth in combination with token should throw', (t) => {
  t = tspl(t, { plan: 1 })
  t.throws(() => new ProxyAgent({
    auth: 'foo',
    token: 'Bearer bar',
    uri: 'http://example.com'
  }),
  InvalidArgumentError
  )
})

test('should accept string, URL and object as options', (t) => {
  t = tspl(t, { plan: 3 })
  t.doesNotThrow(() => new ProxyAgent('http://example.com'))
  t.doesNotThrow(() => new ProxyAgent(new URL('http://example.com')))
  t.doesNotThrow(() => new ProxyAgent({ uri: 'http://example.com' }))
})

test('use proxy-agent to connect through proxy', async (t) => {
  t = tspl(t, { plan: 6 })
  const server = await buildServer()
  const proxy = await buildProxy()
  delete proxy.authenticate

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.on('connect', () => {
    t.ok(true, 'should connect to proxy')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy agent to connect through proxy using Pool', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()
  let resolveFirstConnect
  let connectCount = 0

  proxy.authenticate = async function (req, fn) {
    if (++connectCount === 2) {
      t.ok(true, 'second connect should arrive while first is still inflight')
      resolveFirstConnect()
      fn(null, true)
    } else {
      await new Promise((resolve) => {
        resolveFirstConnect = resolve
      })
      fn(null, true)
    }
  }

  server.on('request', (req, res) => {
    res.end()
  })

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const clientFactory = (url, options) => {
    return new Pool(url, options)
  }
  const proxyAgent = new ProxyAgent({ auth: Buffer.from('user:pass').toString('base64'), uri: proxyUrl, clientFactory })
  const firstRequest = request(`${serverUrl}`, { dispatcher: proxyAgent })
  const secondRequest = await request(`${serverUrl}`, { dispatcher: proxyAgent })
  t.strictEqual((await firstRequest).statusCode, 200)
  t.strictEqual(secondRequest.statusCode, 200)
  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent to connect through proxy using path with params', async (t) => {
  t = tspl(t, { plan: 6 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.on('connect', () => {
    t.ok(true, 'should call proxy')
  })
  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar', { dispatcher: proxyAgent })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent to connect through proxy with basic auth in URL', async (t) => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = new URL(`http://user:pass@localhost:${proxy.address().port}`)
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    fn(null, req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`)
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar', { dispatcher: proxyAgent })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with auth', async (t) => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    auth: Buffer.from('user:pass').toString('base64'),
    uri: proxyUrl
  })
  const parsedOrigin = new URL(serverUrl)

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    fn(null, req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`)
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar', { dispatcher: proxyAgent })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with token', async (t) => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    token: `Bearer ${Buffer.from('user:pass').toString('base64')}`,
    uri: proxyUrl
  })
  const parsedOrigin = new URL(serverUrl)

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    fn(null, req.headers['proxy-authorization'] === `Bearer ${Buffer.from('user:pass').toString('base64')}`)
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar', { dispatcher: proxyAgent })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with custom headers', async (t) => {
  t = tspl(t, { plan: 2 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    headers: {
      'User-Agent': 'Foobar/1.0.0'
    }
  })

  proxy.on('connect', (req) => {
    t.strictEqual(req.headers['user-agent'], 'Foobar/1.0.0')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.headers['user-agent'], 'BarBaz/1.0.0')
    res.end()
  })

  await request(serverUrl + '/hello?foo=bar', {
    headers: { 'user-agent': 'BarBaz/1.0.0' },
    dispatcher: proxyAgent
  })

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('sending proxy-authorization in request headers should throw', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)

  server.on('request', (req, res) => {
    res.end(JSON.stringify({ hello: 'world' }))
  })

  await t.rejects(
    request(
      serverUrl + '/hello?foo=bar',
      {
        dispatcher: proxyAgent,
        headers: {
          'proxy-authorization': Buffer.from('user:pass').toString('base64')
        }
      }
    ),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  await t.rejects(
    request(
      serverUrl + '/hello?foo=bar',
      {
        dispatcher: proxyAgent,
        headers: {
          'PROXY-AUTHORIZATION': Buffer.from('user:pass').toString('base64')
        }
      }
    ),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  await t.rejects(
    request(
      serverUrl + '/hello?foo=bar',
      {
        dispatcher: proxyAgent,
        headers: {
          'Proxy-Authorization': Buffer.from('user:pass').toString('base64')
        }
      }
    ),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('use proxy-agent with setGlobalDispatcher', async (t) => {
  t = tspl(t, { plan: 6 })
  const defaultDispatcher = getGlobalDispatcher()

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const parsedOrigin = new URL(serverUrl)
  setGlobalDispatcher(proxyAgent)

  after(() => setGlobalDispatcher(defaultDispatcher))

  proxy.on('connect', () => {
    t.ok(true, 'should call proxy')
  })
  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(req.headers.host, parsedOrigin.host, 'should not use proxyUrl as host')
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const {
    statusCode,
    headers,
    body
  } = await request(serverUrl + '/hello?foo=bar')
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(headers.connection, 'keep-alive', 'should remain the connection open')

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('ProxyAgent correctly sends headers when using fetch - #1355, #1623', async (t) => {
  t = tspl(t, { plan: 2 })
  const defaultDispatcher = getGlobalDispatcher()

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  const proxyAgent = new ProxyAgent(proxyUrl)
  setGlobalDispatcher(proxyAgent)

  after(() => setGlobalDispatcher(defaultDispatcher))

  const expectedHeaders = {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive',
    'test-header': 'value',
    accept: '*/*',
    'accept-language': '*',
    'sec-fetch-mode': 'cors',
    'user-agent': 'undici',
    'accept-encoding': 'gzip, deflate'
  }

  const expectedProxyHeaders = {
    host: `localhost:${server.address().port}`,
    connection: 'close'
  }

  proxy.on('connect', (req, res) => {
    t.deepStrictEqual(req.headers, expectedProxyHeaders)
  })

  server.on('request', (req, res) => {
    t.deepStrictEqual(req.headers, expectedHeaders)
    res.end('goodbye')
  })

  await fetch(serverUrl, {
    headers: { 'Test-header': 'value' }
  })

  server.close()
  proxy.close()
  proxyAgent.close()
  t.end()
})

test('should throw when proxy does not return 200', async (t) => {
  t = tspl(t, { plan: 2 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req, fn) {
    fn(null, false)
  }

  const proxyAgent = new ProxyAgent(proxyUrl)
  try {
    await request(serverUrl, { dispatcher: proxyAgent })
    t.fail()
  } catch (e) {
    t.ok(true, 'pass')
    t.ok(e)
  }

  server.close()
  proxy.close()
  proxyAgent.close()
  await t.completed
})

test('pass ProxyAgent proxy status code error when using fetch - #2161', async (t) => {
  t = tspl(t, { plan: 1 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req, fn) {
    fn(null, false)
  }

  const proxyAgent = new ProxyAgent(proxyUrl)
  try {
    await fetch(serverUrl, { dispatcher: proxyAgent })
  } catch (e) {
    t.ok('cause' in e)
  }

  server.close()
  proxy.close()
  proxyAgent.close()

  await t.completed
})

test('Proxy via HTTP to HTTPS endpoint', async (t) => {
  t = tspl(t, { plan: 4 })

  const server = await buildSSLServer()
  const proxy = await buildProxy()

  const serverUrl = `https://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    requestTls: {
      ca: [
        readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')
      ],
      key: readFileSync(join(__dirname, 'fixtures', 'client-key-2048.pem'), 'utf8'),
      cert: readFileSync(join(__dirname, 'fixtures', 'client-crt-2048.pem'), 'utf8'),
      servername: 'agent1'
    }
  })

  server.on('request', function (req, res) {
    t.ok(req.connection.encrypted)
    res.end(JSON.stringify(req.headers))
  })

  server.on('secureConnection', () => {
    t.ok(true, 'server should be connected secured')
  })

  proxy.on('secureConnection', () => {
    t.fail('proxy over http should not call secureConnection')
  })

  proxy.on('connect', function () {
    t.ok(true, 'proxy should be connected')
  })

  proxy.on('request', function () {
    t.fail('proxy should never receive requests')
  })

  const data = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await data.body.json()
  t.deepStrictEqual(json, {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive'
  })

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('Proxy via HTTPS to HTTPS endpoint', async (t) => {
  t = tspl(t, { plan: 5 })
  const server = await buildSSLServer()
  const proxy = await buildSSLProxy()

  const serverUrl = `https://localhost:${server.address().port}`
  const proxyUrl = `https://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: {
      ca: [
        readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')
      ],
      key: readFileSync(join(__dirname, 'fixtures', 'client-key-2048.pem'), 'utf8'),
      cert: readFileSync(join(__dirname, 'fixtures', 'client-crt-2048.pem'), 'utf8'),
      servername: 'agent1',
      rejectUnauthorized: false
    },
    requestTls: {
      ca: [
        readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')
      ],
      key: readFileSync(join(__dirname, 'fixtures', 'client-key-2048.pem'), 'utf8'),
      cert: readFileSync(join(__dirname, 'fixtures', 'client-crt-2048.pem'), 'utf8'),
      servername: 'agent1'
    }
  })

  server.on('request', function (req, res) {
    t.ok(req.connection.encrypted)
    res.end(JSON.stringify(req.headers))
  })

  server.on('secureConnection', () => {
    t.ok(true, 'server should be connected secured')
  })

  proxy.on('secureConnection', () => {
    t.ok(true, 'proxy over http should call secureConnection')
  })

  proxy.on('connect', function () {
    t.ok(true, 'proxy should be connected')
  })

  proxy.on('request', function () {
    t.fail('proxy should never receive requests')
  })

  const data = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await data.body.json()
  t.deepStrictEqual(json, {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive'
  })

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('Proxy via HTTPS to HTTP endpoint', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildSSLProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `https://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: {
      ca: [
        readFileSync(join(__dirname, 'fixtures', 'ca.pem'), 'utf8')
      ],
      key: readFileSync(join(__dirname, 'fixtures', 'client-key-2048.pem'), 'utf8'),
      cert: readFileSync(join(__dirname, 'fixtures', 'client-crt-2048.pem'), 'utf8'),
      servername: 'agent1',
      rejectUnauthorized: false
    }
  })

  server.on('request', function (req, res) {
    t.ok(!req.connection.encrypted)
    res.end(JSON.stringify(req.headers))
  })

  server.on('secureConnection', () => {
    t.fail('server is http')
  })

  proxy.on('secureConnection', () => {
    t.ok(true, 'proxy over http should call secureConnection')
  })

  proxy.on('request', function () {
    t.fail('proxy should never receive requests')
  })

  const data = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await data.body.json()
  t.deepStrictEqual(json, {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive'
  })

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('Proxy via HTTP to HTTP endpoint', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)

  server.on('request', function (req, res) {
    t.ok(!req.connection.encrypted)
    res.end(JSON.stringify(req.headers))
  })

  server.on('secureConnection', () => {
    t.fail('server is http')
  })

  proxy.on('secureConnection', () => {
    t.fail('proxy is http')
  })

  proxy.on('connect', () => {
    t.ok(true, 'connect to proxy')
  })

  proxy.on('request', function () {
    t.fail('proxy should never receive requests')
  })

  const data = await request(serverUrl, { dispatcher: proxyAgent })
  const json = await data.body.json()
  t.deepStrictEqual(json, {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive'
  })

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

function buildSSLServer () {
  const serverOptions = {
    ca: [
      readFileSync(join(__dirname, 'fixtures', 'client-ca-crt.pem'), 'utf8')
    ],
    key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
    cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
  }
  return new Promise((resolve) => {
    const server = https.createServer(serverOptions)
    server.listen(0, () => resolve(server))
  })
}

function buildProxy (listener) {
  return new Promise((resolve) => {
    const server = listener
      ? proxy(createServer(listener))
      : proxy(createServer())
    server.listen(0, () => resolve(server))
  })
}

function buildSSLProxy () {
  const serverOptions = {
    ca: [
      readFileSync(join(__dirname, 'fixtures', 'client-ca-crt.pem'), 'utf8')
    ],
    key: readFileSync(join(__dirname, 'fixtures', 'key.pem'), 'utf8'),
    cert: readFileSync(join(__dirname, 'fixtures', 'cert.pem'), 'utf8')
  }

  return new Promise((resolve) => {
    const server = proxy(https.createServer(serverOptions))
    server.listen(0, () => resolve(server))
  })
}
