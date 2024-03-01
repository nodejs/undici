'use strict'

const { test, after } = require('node:test')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { createServer } = require('node:http')
const https = require('node:https')

const { tspl } = require('@matteo.collina/tspl')
const { createProxy } = require('proxy')

const {
  Client,
  interceptors,
  getGlobalDispatcher,
  setGlobalDispatcher,
  request,
  Pool,
  Dispatcher
} = require('../..')
const { InvalidArgumentError } = require('../../lib/core/errors')
const { Proxy } = interceptors

test('should throw error when no uri is provided', t => {
  t = tspl(t, { plan: 2 })
  t.throws(() => new Proxy(), InvalidArgumentError)
  t.throws(() => new Proxy(null, {}), InvalidArgumentError)
})

test('using auth in combination with token should throw', t => {
  t = tspl(t, { plan: 1 })
  t.throws(
    () =>
      new Proxy({}, {
        auth: 'foo',
        token: 'Bearer bar',
        uri: 'http://example.com'
      }),
    InvalidArgumentError
  )
})

test('should accept string, URL and object as options', t => {
  t = tspl(t, { plan: 3 })
  t.doesNotThrow(() => new Proxy({}, 'http://example.com'))
  t.doesNotThrow(() => new Proxy({}, new URL('http://example.com')))
  t.doesNotThrow(() => new Proxy({}, { uri: 'http://example.com' }))
})

test('use proxy-agent to connect through proxy', { skip: true }, async t => {
  t = tspl(t, { plan: 8 })
  const CustomDispatcher = class extends Dispatcher {
    constructor (dispatcher) {
      super()
      this.dispatcher = dispatcher
    }

    dispatch (opts, handler) {
      t.ok(true, 'should call dispatch')
      return this.dispatcher.dispatch(opts, handler)
    }

    close () {
      return this.dispatcher.close()
    }
  }
  const server = await buildServer()
  const proxy = await buildProxy()
  delete proxy.authenticate

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)
  const dispatcher = client.compose([
    (dispatcher) => new CustomDispatcher(dispatcher),
    (dispatcher) => new Proxy(dispatcher, proxyUrl),
    (dispatcher) => new CustomDispatcher(dispatcher)
  ])

  proxy.on('connect', () => {
    t.ok(true, 'should connect to proxy')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    path: '/',
    method: 'GET',
    origin: serverUrl
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-interceptor to connect through proxy when composing dispatcher', async t => {
  t = tspl(t, { plan: 6 })
  const server = await buildServer()
  const proxy = await buildProxy()
  delete proxy.authenticate

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)

  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, proxyUrl)
  )

  proxy.on('connect', () => {
    t.ok(true, 'should connect to proxy')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    path: '/',
    method: 'GET',
    origin: serverUrl
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy agent to connect through proxy using Pool', async t => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()
  let resolveFirstConnect
  let connectCount = 0

  proxy.authenticate = async function (req) {
    if (++connectCount === 2) {
      t.ok(true, 'second connect should arrive while first is still inflight')
      resolveFirstConnect()
    } else {
      await new Promise(resolve => {
        resolveFirstConnect = resolve
      })
    }

    return true
  }

  server.on('request', (req, res) => {
    res.end()
  })

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const clientFactory = (url, options) => {
    return new Pool(url, options)
  }
  const client = new Client(serverUrl)
  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, {
      auth: Buffer.from('user:pass').toString('base64'),
      uri: proxyUrl,
      clientFactory
    })
  )
  const firstRequest = dispatcher.request({
    path: '/',
    method: 'GET',
    origin: serverUrl
  })
  const secondRequest = await dispatcher.request({
    path: '/',
    method: 'GET',
    origin: serverUrl
  })
  t.strictEqual((await firstRequest).statusCode, 200)
  t.strictEqual(secondRequest.statusCode, 200)
  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent to connect through proxy using path with params', async t => {
  t = tspl(t, { plan: 6 })
  const server = await buildServer()
  const proxy = await buildProxy()
  delete proxy.authenticate

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)
  const dispatcher = client.compose(dispatcher => new Proxy(dispatcher, proxyUrl))

  proxy.on('connect', () => {
    t.ok(true, 'should call proxy')
  })
  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    origin: serverUrl,
    method: 'GET',
    path: '/hello?foo=bar'
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent to connect through proxy with basic auth in URL', async t => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://user:pass@localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)
  const dispatcher = client.compose(dispatcher => new Proxy(dispatcher, proxyUrl))

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    return (
      req.headers['proxy-authorization'] ===
      `Basic ${Buffer.from('user:pass').toString('base64')}`
    )
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    origin: serverUrl,
    method: 'GET',
    path: '/hello?foo=bar'
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent with auth', async t => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://user:pass@localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)
  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, {
      auth: Buffer.from('user:pass').toString('base64'),
      uri: proxyUrl
    })
  )

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    return (
      req.headers['proxy-authorization'] ===
      `Basic ${Buffer.from('user:pass').toString('base64')}`
    )
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    origin: serverUrl,
    method: 'GET',
    path: '/hello?foo=bar'
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent with token', async t => {
  t = tspl(t, { plan: 7 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://user:pass@localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const parsedOrigin = new URL(serverUrl)
  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, {
      token: `Bearer ${Buffer.from('user:pass').toString('base64')}`,
      uri: proxyUrl
    })
  )

  proxy.authenticate = function (req, fn) {
    t.ok(true, 'authentication should be called')
    return (
      req.headers['proxy-authorization'] ===
      `Bearer ${Buffer.from('user:pass').toString('base64')}`
    )
  }
  proxy.on('connect', () => {
    t.ok(true, 'proxy should be called')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/hello?foo=bar')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await dispatcher.request({
    origin: serverUrl,
    method: 'GET',
    path: '/hello?foo=bar'
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent with custom headers', async t => {
  t = tspl(t, { plan: 2 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://user:pass@localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, {
      uri: proxyUrl,
      headers: {
        'User-Agent': 'Foobar/1.0.0'
      }
    })
  )

  proxy.on('connect', req => {
    t.strictEqual(req.headers['user-agent'], 'Foobar/1.0.0')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.headers['user-agent'], 'BarBaz/1.0.0')
    res.end()
  })

  await dispatcher.request({
    origin: serverUrl,
    method: 'GET',
    path: '/hello?foo=bar',
    headers: { 'user-agent': 'BarBaz/1.0.0' }
  })

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('sending proxy-authorization in request headers should throw', async t => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const client = new Client(serverUrl)
  const dispatcher = client.compose(
    dispatcher => new Proxy(dispatcher, {
      uri: proxyUrl
    })
  )

  server.on('request', (req, res) => {
    res.end(JSON.stringify({ hello: 'world' }))
  })

  await t.rejects(
    dispatcher.request({
      origin: serverUrl,
      method: 'GET',
      path: '/hello?foo=bar',
      headers: {
        'proxy-authorization': Buffer.from('user:pass').toString('base64')
      }
    }),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  await t.rejects(
    dispatcher.request({
      origin: serverUrl,
      method: 'GET',
      path: '/hello?foo=bar',
      headers: {
        'PROXY-AUTHORIZATION': Buffer.from('user:pass').toString('base64')
      }
    }),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  await t.rejects(
    dispatcher.request({
      origin: serverUrl,
      method: 'GET',
      path: '/hello?foo=bar',
      headers: {
        'Proxy-Authorization': Buffer.from('user:pass').toString('base64')
      }
    }),
    'Proxy-Authorization should be sent in ProxyAgent'
  )

  server.close()
  proxy.close()
  await dispatcher.close()
})

test('use proxy-agent with setGlobalDispatcher', async t => {
  t = tspl(t, { plan: 6 })

  const server = await buildServer()
  const proxy = await buildProxy()
  delete proxy.authenticate

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const parsedOrigin = new URL(serverUrl)
  const defaultDispatcher = getGlobalDispatcher()

  setGlobalDispatcher(defaultDispatcher.compose(dispatcher => new Proxy(dispatcher, proxyUrl)))
  after(() => setGlobalDispatcher(defaultDispatcher))

  proxy.on('connect', () => {
    t.ok(true, 'should connect to proxy')
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.url, '/')
    t.strictEqual(
      req.headers.host,
      parsedOrigin.host,
      'should not use proxyUrl as host'
    )
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'world' }))
  })

  const { statusCode, headers, body } = await request({
    path: '/',
    method: 'GET',
    origin: serverUrl
  })
  const json = await body.json()

  t.strictEqual(statusCode, 200)
  t.deepStrictEqual(json, { hello: 'world' })
  t.strictEqual(
    headers.connection,
    'keep-alive',
    'should remain the connection open'
  )

  server.close()
  proxy.close()
})

test('ProxyAgent correctly sends headers when using fetch - #1355, #1623', async t => {
  t = tspl(t, { plan: 2 })
  const defaultDispatcher = getGlobalDispatcher()

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  setGlobalDispatcher(defaultDispatcher.compose(dispatcher => new Proxy(dispatcher, proxyUrl)))

  after(() => setGlobalDispatcher(defaultDispatcher))

  const expectedHeaders = {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive',
    'test-header': 'value',
    accept: '*/*',
    'accept-language': '*',
    'sec-fetch-mode': 'cors',
    'user-agent': 'node',
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
  t.end()
})

test('should throw when proxy does not return 200', async t => {
  t = tspl(t, { plan: 1 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req, fn) {
    return false
  }

  const client = new Client(serverUrl).compose(dispatcher => new Proxy(dispatcher, proxyUrl))
  try {
    await client.request({ path: '/', method: 'GET' })
    t.fail()
  } catch (e) {
    t.ok(e)
  }

  server.close()
  proxy.close()
  await t.completed
})

test('pass ProxyAgent proxy status code error when using fetch - #2161', async t => {
  t = tspl(t, { plan: 1 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (req, fn) {
    return false
  }

  const client = new Client(serverUrl).compose(dispatcher => new Proxy(dispatcher, proxyUrl))
  try {
    await fetch(serverUrl, { dispatcher: client })
    t.fail()
  } catch (e) {
    t.ok('cause' in e)
  }

  server.close()
  proxy.close()
  await t.completed
})

test('Proxy via HTTP to HTTPS endpoint', async t => {
  t = tspl(t, { plan: 4 })

  const server = await buildSSLServer()
  const proxy = await buildProxy()

  const serverUrl = `https://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const client = new Client(serverUrl).compose(
    dispatcher => new Proxy(dispatcher, {
      uri: proxyUrl,
      requestTls: {
        ca: [
          readFileSync(resolve(__dirname, '../', 'fixtures', 'ca.pem'), 'utf8')
        ],
        key: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-key-2048.pem'),
          'utf8'
        ),
        cert: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-crt-2048.pem'),
          'utf8'
        ),
        servername: 'agent1'
      }
    })
  )

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

  const data = await client.request({
    path: '/',
    origin: serverUrl,
    method: 'GET'
  })
  const json = await data.body.json()
  t.deepStrictEqual(json, {
    host: `localhost:${server.address().port}`,
    connection: 'keep-alive'
  })

  server.close()
  proxy.close()
  await client.close()
})

test('Proxy via HTTPS to HTTPS endpoint', async t => {
  t = tspl(t, { plan: 5 })
  const server = await buildSSLServer()
  const proxy = await buildSSLProxy()

  const serverUrl = `https://localhost:${server.address().port}`
  const proxyUrl = `https://localhost:${proxy.address().port}`
  const proxyAgent = new Client(serverUrl).compose(
    dispatcher => new Proxy(dispatcher, {
      uri: proxyUrl,
      proxyTls: {
        ca: [
          readFileSync(resolve(__dirname, '../', 'fixtures', 'ca.pem'), 'utf8')
        ],
        key: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-key-2048.pem'),
          'utf8'
        ),
        cert: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-crt-2048.pem'),
          'utf8'
        ),
        servername: 'agent1',
        rejectUnauthorized: false
      },
      requestTls: {
        ca: [
          readFileSync(resolve(__dirname, '../', 'fixtures', 'ca.pem'), 'utf8')
        ],
        key: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-key-2048.pem'),
          'utf8'
        ),
        cert: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-crt-2048.pem'),
          'utf8'
        ),
        servername: 'agent1'
      }
    })
  )

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

test('Proxy via HTTPS to HTTP endpoint', async t => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildSSLProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `https://localhost:${proxy.address().port}`
  const proxyAgent = new Client(serverUrl).compose(
    dispatcher => new Proxy(dispatcher, {
      uri: proxyUrl,
      proxyTls: {
        ca: [
          readFileSync(resolve(__dirname, '../', 'fixtures', 'ca.pem'), 'utf8')
        ],
        key: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-key-2048.pem'),
          'utf8'
        ),
        cert: readFileSync(
          resolve(__dirname, '../', 'fixtures', 'client-crt-2048.pem'),
          'utf8'
        ),
        servername: 'agent1',
        rejectUnauthorized: false
      }
    })
  )

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
  await proxyAgent.close()
})

test('Proxy via HTTP to HTTP endpoint', async t => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new Client(serverUrl).compose(dispatcher => new Proxy(dispatcher, proxyUrl))

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
  await proxyAgent.close()
})

function buildServer () {
  return new Promise(resolve => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildSSLServer () {
  const serverOptions = {
    ca: [
      readFileSync(
        resolve(__dirname, '../', 'fixtures', 'client-ca-crt.pem'),
        'utf8'
      )
    ],
    key: readFileSync(resolve(__dirname, '../', 'fixtures', 'key.pem'), 'utf8'),
    cert: readFileSync(
      resolve(__dirname, '../', 'fixtures', 'cert.pem'),
      'utf8'
    )
  }
  return new Promise(resolve => {
    const server = https.createServer(serverOptions)
    server.listen(0, () => resolve(server))
  })
}

function buildProxy (listener) {
  return new Promise(resolve => {
    const server = listener
      ? createProxy(createServer(listener))
      : createProxy(createServer())
    server.listen(0, () => resolve(server))
  })
}

function buildSSLProxy () {
  const serverOptions = {
    ca: [
      readFileSync(
        resolve(__dirname, '../', 'fixtures', 'client-ca-crt.pem'),
        'utf8'
      )
    ],
    key: readFileSync(resolve(__dirname, '../', 'fixtures', 'key.pem'), 'utf8'),
    cert: readFileSync(
      resolve(__dirname, '../', 'fixtures', 'cert.pem'),
      'utf8'
    )
  }

  return new Promise(resolve => {
    const server = createProxy(https.createServer(serverOptions))
    server.listen(0, () => resolve(server))
  })
}