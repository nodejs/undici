'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test, after } = require('node:test')
const { request, fetch, setGlobalDispatcher, getGlobalDispatcher } = require('..')
const { InvalidArgumentError, SecureProxyConnectionError } = require('../lib/core/errors')
const ProxyAgent = require('../lib/dispatcher/proxy-agent')
const Pool = require('../lib/dispatcher/pool')
const { createServer } = require('node:http')
const https = require('node:https')
const { createProxy } = require('proxy')

const certs = (() => {
  const forge = require('node-forge')
  const createCert = (cn, issuer, keyLength = 2048) => {
    const keys = forge.pki.rsa.generateKeyPair(keyLength)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '' + Date.now()
    cert.validity.notBefore = new Date()
    cert.validity.notAfter = new Date()
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10)

    const attrs = [{
      name: 'commonName',
      value: cn
    }]
    cert.setSubject(attrs)
    const isCa = issuer === undefined
    cert.setExtensions([{
      name: 'basicConstraints',
      cA: isCa
    }, {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true
    }, {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true
    }, {
      name: 'nsCertType',
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: isCa,
      emailCA: isCa,
      objCA: isCa
    }])

    const alg = forge.md.sha256.create()
    if (issuer !== undefined) {
      cert.setIssuer(issuer.certificate.subject.attributes)
      cert.sign(issuer.privateKey, alg)
    } else {
      cert.setIssuer(attrs)
      cert.sign(keys.privateKey, alg)
    }
    return {
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      certificate: cert
    }
  }

  const root = createCert('CA')
  const server = createCert('agent1', root)
  const client = createCert('client', root)
  const proxy = createCert('proxy', root)

  return {
    root: {
      key: forge.pki.privateKeyToPem(root.privateKey),
      crt: forge.pki.certificateToPem(root.certificate)
    },
    server: {
      key: forge.pki.privateKeyToPem(server.privateKey),
      crt: forge.pki.certificateToPem(server.certificate)
    },
    client: {
      key: forge.pki.privateKeyToPem(client.privateKey),
      crt: forge.pki.certificateToPem(client.certificate)
    },
    proxy: {
      key: forge.pki.privateKeyToPem(proxy.privateKey),
      crt: forge.pki.certificateToPem(proxy.certificate)
    }
  }
})()

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

  proxy.authenticate = async function (req) {
    if (++connectCount === 2) {
      t.ok(true, 'second connect should arrive while first is still inflight')
      resolveFirstConnect()
      return true
    } else {
      await new Promise((resolve) => {
        resolveFirstConnect = resolve
      })
      return true
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
    return req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`
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

  proxy.authenticate = function (req) {
    t.ok(true, 'authentication should be called')
    return req.headers['proxy-authorization'] === `Basic ${Buffer.from('user:pass').toString('base64')}`
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

  proxy.authenticate = function (req) {
    t.ok(true, 'authentication should be called')
    return req.headers['proxy-authorization'] === `Bearer ${Buffer.from('user:pass').toString('base64')}`
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
  t = tspl(t, { plan: 3 })

  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (_req) {
    t.ok(true, 'should call authenticate')
    return false
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
  t = tspl(t, { plan: 2 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`

  proxy.authenticate = function (_req) {
    t.ok(true, 'should call authenticate')
    return false
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
        certs.root.crt
      ],
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
        certs.root.crt
      ],
      servername: 'proxy'
    },
    requestTls: {
      ca: [
        certs.root.crt
      ],
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
        certs.root.crt
      ],
      servername: 'proxy'
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

test('Proxy via HTTPS to HTTP fails on wrong SNI', async (t) => {
  t = tspl(t, { plan: 3 })
  const server = await buildServer()
  const proxy = await buildSSLProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `https://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: {
      ca: [
        certs.root.crt
      ]
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
    t.fail('proxy is http')
  })

  proxy.on('connect', () => {
    t.ok(true, 'connect to proxy')
  })

  proxy.on('request', function () {
    t.fail('proxy should never receive requests')
  })

  try {
    await request(serverUrl, { dispatcher: proxyAgent })
    throw new Error('should fail')
  } catch (e) {
    t.ok(e instanceof SecureProxyConnectionError)
    t.ok(e.cause instanceof Error)
    t.ok(e.cause.code === 'ERR_TLS_CERT_ALTNAME_INVALID')
  }

  server.close()
  proxy.close()
  proxyAgent.close()
})

test('ProxyAgent keeps customized host in request headers - #3019', async (t) => {
  t = tspl(t, { plan: 2 })
  const server = await buildServer()
  const proxy = await buildProxy()

  const serverUrl = `http://localhost:${server.address().port}`
  const proxyUrl = `http://localhost:${proxy.address().port}`
  const proxyAgent = new ProxyAgent(proxyUrl)
  const customHost = 'example.com'

  proxy.on('connect', (req) => {
    t.strictEqual(req.headers.host, `localhost:${server.address().port}`)
  })

  server.on('request', (req, res) => {
    t.strictEqual(req.headers.host, customHost)
    res.end()
  })

  await request(serverUrl, {
    headers: { Host: customHost },
    dispatcher: proxyAgent
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
      certs.root.crt
    ],
    key: certs.server.key,
    cert: certs.server.crt
  }
  return new Promise((resolve) => {
    const server = https.createServer(serverOptions)
    server.listen(0, () => resolve(server))
  })
}

function buildProxy (listener) {
  return new Promise((resolve) => {
    const server = listener
      ? createProxy(createServer(listener))
      : createProxy(createServer())
    server.listen(0, () => resolve(server))
  })
}

function buildSSLProxy () {
  const serverOptions = {
    ca: [
      certs.root.crt
    ],
    key: certs.proxy.key,
    cert: certs.proxy.crt
  }

  return new Promise((resolve) => {
    const server = createProxy(https.createServer(serverOptions))
    server.listen(0, () => resolve(server))
  })
}
