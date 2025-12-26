'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')
const ProxyAgent = require('../lib/dispatcher/proxy-agent')
const { createServer } = require('node:http')
const { TestSocks5Server } = require('./fixtures/socks5-test-server')

test('ProxyAgent - SOCKS5 constructor validation', async (t) => {
  const p = tspl(t, { plan: 2 })

  p.throws(() => {
    // eslint-disable-next-line no-new
    new ProxyAgent()
  }, InvalidArgumentError, 'should throw when proxy uri is not provided')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new ProxyAgent('socks5://localhost:1080')
  }, 'should accept socks5:// URLs')

  await p.completed
})

test('ProxyAgent - SOCKS5 basic connection', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Hello from target server' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server
  const socksServer = new TestSocks5Server()
  const socksAddress = await socksServer.listen()

  try {
    // Create ProxyAgent with SOCKS5 proxy
    const proxyAgent = new ProxyAgent(`socks5://localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/test`, {
      dispatcher: proxyAgent
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, { message: 'Hello from target server' }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('ProxyAgent - SOCKS5 with authentication', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create ProxyAgent with SOCKS5 proxy and auth
  const proxyAgent = new ProxyAgent('socks5://user:pass@localhost:1080')

  // This test just verifies the agent can be created with auth credentials
  p.ok(proxyAgent, 'should create ProxyAgent with SOCKS5 auth')

  await p.completed
})

test('ProxyAgent - SOCKS5 connection failure', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create ProxyAgent pointing to non-existent SOCKS5 proxy
  const proxyAgent = new ProxyAgent('socks5://localhost:9999')

  try {
    await request('http://localhost:8080/test', {
      dispatcher: proxyAgent
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy is not available')
  }

  await p.completed
})
