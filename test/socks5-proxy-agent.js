'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const { request } = require('..')
const { InvalidArgumentError } = require('../lib/core/errors')
const Socks5ProxyAgent = require('../lib/dispatcher/socks5-proxy-agent')
const { createServer } = require('node:http')
const { TestSocks5Server } = require('./fixtures/socks5-test-server')

test('Socks5ProxyAgent - constructor validation', async (t) => {
  const p = tspl(t, { plan: 4 })

  p.throws(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent()
  }, InvalidArgumentError, 'should throw when proxy URL is not provided')

  p.throws(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent('http://localhost:1080')
  }, InvalidArgumentError, 'should throw when proxy URL protocol is not socks5')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent('socks5://localhost:1080')
  }, 'should accept socks5:// URLs')

  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent('socks://localhost:1080')
  }, 'should accept socks:// URLs for compatibility')

  await p.completed
})

test('Socks5ProxyAgent - basic HTTP connection', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Hello from target server', path: req.url }))
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
    // Create Socks5ProxyAgent
    const proxyWrapper = new Socks5ProxyAgent(`socks5://localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/test`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Hello from target server',
      path: '/test'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test.skip('Socks5ProxyAgent - HTTPS connection', async (t) => {
  // Skip HTTPS test for now - TLS option passing needs additional work
  t.skip('HTTPS test requires TLS option refinement')
})

test('Socks5ProxyAgent - with authentication', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Authenticated request successful' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server with auth
  const socksServer = new TestSocks5Server({
    requireAuth: true,
    credentials: { username: 'testuser', password: 'testpass' }
  })
  const socksAddress = await socksServer.listen()

  try {
    // Create Socks5ProxyAgent with auth
    const proxyWrapper = new Socks5ProxyAgent(`socks5://testuser:testpass@localhost:${socksAddress.port}`)

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/auth-test`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Authenticated request successful'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyAgent - authentication with options', async (t) => {
  const p = tspl(t, { plan: 2 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: 'Options auth successful' }))
  })

  // Start target server
  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server with auth
  const socksServer = new TestSocks5Server({
    requireAuth: true,
    credentials: { username: 'optuser', password: 'optpass' }
  })
  const socksAddress = await socksServer.listen()

  try {
    // Create Socks5ProxyAgent with auth in options
    const proxyWrapper = new Socks5ProxyAgent(`socks5://localhost:${socksAddress.port}`, {
      username: 'optuser',
      password: 'optpass'
    })

    // Make request through SOCKS5 proxy
    const response = await request(`http://localhost:${serverPort}/options-auth`, {
      dispatcher: proxyWrapper
    })

    p.equal(response.statusCode, 200, 'should get 200 status code')

    const body = await response.body.json()
    p.deepEqual(body, {
      message: 'Options auth successful'
    }, 'should get correct response body')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyAgent - multiple requests through same proxy', async (t) => {
  const p = tspl(t, { plan: 4 })

  // Create target HTTP server
  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ message: `Request ${requestCount}`, path: req.url }))
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
    // Create Socks5ProxyAgent
    const proxyWrapper = new Socks5ProxyAgent(`socks5://localhost:${socksAddress.port}`)

    // Make first request
    const response1 = await request(`http://localhost:${serverPort}/request1`, {
      dispatcher: proxyWrapper
    })

    p.equal(response1.statusCode, 200, 'should get 200 status code for first request')
    const body1 = await response1.body.json()
    p.deepEqual(body1, { message: 'Request 1', path: '/request1' }, 'should get correct response body for first request')

    // Make second request through same proxy
    const response2 = await request(`http://localhost:${serverPort}/request2`, {
      dispatcher: proxyWrapper
    })

    p.equal(response2.statusCode, 200, 'should get 200 status code for second request')
    const body2 = await response2.body.json()
    p.deepEqual(body2, { message: 'Request 2', path: '/request2' }, 'should get correct response body for second request')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyAgent - requests to different origins are routed correctly', async (t) => {
  const p = tspl(t, { plan: 4 })

  // Create two distinct target servers
  const serverA = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ server: 'A', path: req.url }))
  })
  const serverB = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ server: 'B', path: req.url }))
  })

  await new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve))
  await new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve))
  const portA = serverA.address().port
  const portB = serverB.address().port

  const socksServer = new TestSocks5Server()
  const socksAddress = await socksServer.listen()

  try {
    const proxyWrapper = new Socks5ProxyAgent(`socks5://127.0.0.1:${socksAddress.port}`)

    // First request goes to server A — establishes a pool
    const respA = await request(`http://127.0.0.1:${portA}/a`, { dispatcher: proxyWrapper })
    p.equal(respA.statusCode, 200)
    p.deepEqual(await respA.body.json(), { server: 'A', path: '/a' })

    // Second request goes to server B — must NOT reuse the pool from origin A
    const respB = await request(`http://127.0.0.1:${portB}/b`, { dispatcher: proxyWrapper })
    p.equal(respB.statusCode, 200)
    p.deepEqual(await respB.body.json(), { server: 'B', path: '/b' }, 'request to origin B must reach server B, not server A')
  } finally {
    await socksServer.close()
    serverA.close()
    serverB.close()
  }

  await p.completed
})

test('Socks5ProxyAgent - connection failure', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create Socks5ProxyAgent pointing to non-existent proxy
  const proxyWrapper = new Socks5ProxyAgent('socks5://localhost:9999')

  try {
    await request('http://example.com/', {
      dispatcher: proxyWrapper
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy is not available')
  }

  await p.completed
})

test('Socks5ProxyAgent - proxy connection refused', async (t) => {
  const p = tspl(t, { plan: 1 })

  // Create target HTTP server
  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('OK')
  })

  await new Promise((resolve) => {
    server.listen(0, resolve)
  })
  const serverPort = server.address().port

  // Create SOCKS5 proxy server that simulates connection failure
  const socksServer = new TestSocks5Server({ simulateFailure: true })
  const socksAddress = await socksServer.listen()

  try {
    const proxyWrapper = new Socks5ProxyAgent(`socks5://localhost:${socksAddress.port}`)

    await request(`http://localhost:${serverPort}/`, {
      dispatcher: proxyWrapper
    })
    p.fail('should have thrown an error')
  } catch (err) {
    p.ok(err, 'should throw error when SOCKS5 proxy refuses connection')
  } finally {
    await socksServer.close()
    server.close()
  }

  await p.completed
})

test('Socks5ProxyAgent - close and destroy', async (t) => {
  const p = tspl(t, { plan: 2 })

  const proxyWrapper = new Socks5ProxyAgent('socks5://localhost:1080')

  // Test close
  await proxyWrapper.close()
  p.ok(true, 'should close without error')

  // Test destroy
  await proxyWrapper.destroy()
  p.ok(true, 'should destroy without error')

  await p.completed
})

test('Socks5ProxyAgent - URL parsing edge cases', async (t) => {
  const p = tspl(t, { plan: 3 })

  // Test with URL object
  const url = new URL('socks5://user:pass@proxy.example.com:1080')
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent(url)
  }, 'should accept URL object')

  // Test with encoded credentials
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent('socks5://user%40domain:p%40ss@localhost:1080')
  }, 'should handle URL-encoded credentials')

  // Test default port
  p.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Socks5ProxyAgent('socks5://localhost')
  }, 'should use default port 1080')

  await p.completed
})
