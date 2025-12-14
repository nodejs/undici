'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { tspl } = require('@matteo.collina/tspl')

const { Agent, interceptors, errors } = require('../..')
const { circuitBreaker } = interceptors
const { CircuitBreakerError } = errors

test('circuit breaker - pass through when closed', async t => {
  t = tspl(t, { plan: 2 })

  const server = createServer((req, res) => {
    res.writeHead(200)
    res.end('ok')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({ threshold: 5 }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const response = await client.request({
    origin: `http://localhost:${server.address().port}`,
    path: '/',
    method: 'GET'
  })

  t.equal(response.statusCode, 200)
  const body = await response.body.text()
  t.equal(body, 'ok')

  await t.completed
})

test('circuit breaker - opens after threshold 500s', async t => {
  t = tspl(t, { plan: 7 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(500)
    res.end('error')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 3,
    timeout: 1000
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // First 3 requests should go through (hitting threshold)
  for (let i = 0; i < 3; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    t.equal(response.statusCode, 500)
    await response.body.dump()
  }

  // 4th request should fail immediately with circuit open
  try {
    await client.request({ origin, path: '/', method: 'GET' })
    t.fail('Should have thrown CircuitBreakerError')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
    t.equal(err.code, 'UND_ERR_CIRCUIT_BREAKER')
    t.equal(err.state, 'open')
  }

  // Verify only 3 requests reached the server
  t.equal(requestCount, 3)

  await t.completed
})

test('circuit breaker - transitions to half-open after timeout', async t => {
  t = tspl(t, { plan: 3 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    if (requestCount <= 3) {
      res.writeHead(500)
      res.end('error')
    } else {
      res.writeHead(200)
      res.end('ok')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 3,
    timeout: 100 // Short timeout for testing
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Trigger 3 failures to open circuit
  for (let i = 0; i < 3; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Wait for timeout to elapse
  await new Promise(resolve => setTimeout(resolve, 150))

  // Now circuit should be half-open, request should go through
  const response = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response.statusCode, 200)
  await response.body.dump()

  // Circuit should now be closed, more requests should work
  const response2 = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response2.statusCode, 200)
  await response2.body.dump()

  t.equal(requestCount, 5)

  await t.completed
})

test('circuit breaker - re-opens on half-open failure', async t => {
  t = tspl(t, { plan: 3 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(500)
    res.end('error')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 100
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Trigger 2 failures to open circuit
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Wait for timeout
  await new Promise(resolve => setTimeout(resolve, 150))

  // Half-open request that fails
  const response = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response.statusCode, 500)
  await response.body.dump()

  // Circuit should be open again
  try {
    await client.request({ origin, path: '/', method: 'GET' })
    t.fail('Should have thrown CircuitBreakerError')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
  }

  t.equal(requestCount, 3)

  await t.completed
})

test('circuit breaker - tracks per origin', async t => {
  t = tspl(t, { plan: 4 })

  let server1Count = 0
  let server2Count = 0

  const server1 = createServer((req, res) => {
    server1Count++
    res.writeHead(500)
    res.end('error')
  })

  const server2 = createServer((req, res) => {
    server2Count++
    res.writeHead(200)
    res.end('ok')
  })

  server1.listen(0)
  server2.listen(0)
  await Promise.all([once(server1, 'listening'), once(server2, 'listening')])

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 1000
  }))

  after(async () => {
    await client.close()
    server1.close()
    server2.close()
    await Promise.all([once(server1, 'close'), once(server2, 'close')])
  })

  const origin1 = `http://localhost:${server1.address().port}`
  const origin2 = `http://localhost:${server2.address().port}`

  // Fail origin1 circuit
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin: origin1, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // origin1 circuit should be open
  try {
    await client.request({ origin: origin1, path: '/', method: 'GET' })
    t.fail('Should have thrown')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
  }

  // origin2 should still work
  const response = await client.request({ origin: origin2, path: '/', method: 'GET' })
  t.equal(response.statusCode, 200)
  await response.body.dump()

  t.equal(server1Count, 2)
  t.equal(server2Count, 1)

  await t.completed
})

test('circuit breaker - custom getKey for route-level', async t => {
  t = tspl(t, { plan: 3 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    if (req.url === '/fail') {
      res.writeHead(500)
      res.end('error')
    } else {
      res.writeHead(200)
      res.end('ok')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 1000,
    getKey: (opts) => `${opts.origin}${opts.path}`
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Fail /fail route
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/fail', method: 'GET' })
    await response.body.dump()
  }

  // /fail route circuit should be open
  try {
    await client.request({ origin, path: '/fail', method: 'GET' })
    t.fail('Should have thrown')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
  }

  // /success route should still work
  const response = await client.request({ origin, path: '/success', method: 'GET' })
  t.equal(response.statusCode, 200)
  await response.body.dump()

  t.equal(requestCount, 3)

  await t.completed
})

test('circuit breaker - custom status codes', async t => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    res.writeHead(429) // Rate limited
    res.end('rate limited')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    statusCodes: [429, 503]
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Trigger failures
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Circuit should be open
  try {
    await client.request({ origin, path: '/', method: 'GET' })
    t.fail('Should have thrown')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
  }

  t.equal(requestCount, 2)

  await t.completed
})

test('circuit breaker - connection errors', async t => {
  t = tspl(t, { plan: 2 })

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 1000
  }))

  after(async () => {
    await client.close()
  })

  // Non-existent server
  const origin = 'http://localhost:59999'

  // First 2 connection failures
  for (let i = 0; i < 2; i++) {
    try {
      await client.request({ origin, path: '/', method: 'GET' })
    } catch (err) {
      // Connection refused is expected
    }
  }

  // Circuit should be open
  try {
    await client.request({ origin, path: '/', method: 'GET' })
    t.fail('Should have thrown CircuitBreakerError')
  } catch (err) {
    t.ok(err instanceof CircuitBreakerError)
    t.equal(err.state, 'open')
  }

  await t.completed
})

test('circuit breaker - validates options', async t => {
  t = tspl(t, { plan: 5 })

  t.throws(() => circuitBreaker({ threshold: 0 }), /threshold must be a positive number/)
  t.throws(() => circuitBreaker({ threshold: -1 }), /threshold must be a positive number/)
  t.throws(() => circuitBreaker({ timeout: -1 }), /timeout must be a non-negative number/)
  t.throws(() => circuitBreaker({ getKey: 'not a function' }), /getKey must be a function/)
  t.throws(() => circuitBreaker({ statusCodes: 'invalid' }), /statusCodes must be an array or Set/)

  await t.completed
})

test('circuit breaker - limits half-open concurrent requests', async t => {
  t = tspl(t, { plan: 3 })

  const server = createServer((req, res) => {
    res.writeHead(500)
    res.end('error')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 50,
    maxHalfOpenRequests: 1
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Open circuit
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Wait for half-open
  await new Promise(resolve => setTimeout(resolve, 100))

  // Fire two concurrent requests - only one should get through
  const results = await Promise.allSettled([
    client.request({ origin, path: '/', method: 'GET' }),
    client.request({ origin, path: '/', method: 'GET' })
  ])

  // One should succeed (500), one should fail with circuit breaker error
  const errorResults = results.filter(r => r.status === 'rejected')
  const fulfilled = results.filter(r => r.status === 'fulfilled')

  t.equal(errorResults.length, 1)
  t.equal(fulfilled.length, 1)
  t.ok(errorResults[0].reason instanceof CircuitBreakerError)

  // Clean up fulfilled response
  for (const r of fulfilled) {
    await r.value.body.dump()
  }

  await t.completed
})

test('circuit breaker - successThreshold > 1', async t => {
  t = tspl(t, { plan: 2 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    if (requestCount <= 2) {
      res.writeHead(500)
      res.end('error')
    } else {
      res.writeHead(200)
      res.end('ok')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 50,
    successThreshold: 2,
    maxHalfOpenRequests: 5
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Open circuit
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Wait for half-open
  await new Promise(resolve => setTimeout(resolve, 100))

  // First success in half-open
  const response1 = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response1.statusCode, 200)
  await response1.body.dump()

  // Second success - should close circuit
  const response2 = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response2.statusCode, 200)
  await response2.body.dump()

  await t.completed
})

test('circuit breaker - onStateChange callback', async t => {
  t = tspl(t, { plan: 4 })

  const stateChanges = []

  const server = createServer((req, res) => {
    res.writeHead(500)
    res.end('error')
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 2,
    timeout: 50,
    onStateChange: (key, newState, prevState) => {
      stateChanges.push({ key, newState, prevState })
    }
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Trigger failures to open circuit
  for (let i = 0; i < 2; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Wait for half-open
  await new Promise(resolve => setTimeout(resolve, 100))

  // Trigger half-open transition by making a request
  try {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  } catch (e) {
    // may fail due to circuit state
  }

  // Check state changes (at least the half-open transition)
  t.ok(stateChanges.length >= 1)
  const halfOpenChange = stateChanges.find(c => c.newState === 'half-open')
  t.ok(halfOpenChange)
  t.equal(halfOpenChange.prevState, 'open')
  t.ok(halfOpenChange.key.includes('localhost'))

  await t.completed
})

test('circuit breaker - success resets failure count in closed state', async t => {
  t = tspl(t, { plan: 3 })

  let requestCount = 0
  const server = createServer((req, res) => {
    requestCount++
    // Alternate: fail, success, fail, success
    if (requestCount % 2 === 1) {
      res.writeHead(500)
      res.end('error')
    } else {
      res.writeHead(200)
      res.end('ok')
    }
  })

  server.listen(0)
  await once(server, 'listening')

  const client = new Agent().compose(circuitBreaker({
    threshold: 3, // Would need 3 consecutive failures
    timeout: 1000
  }))

  after(async () => {
    await client.close()
    server.close()
    await once(server, 'close')
  })

  const origin = `http://localhost:${server.address().port}`

  // Do fail-success-fail-success pattern - should never trip circuit
  for (let i = 0; i < 4; i++) {
    const response = await client.request({ origin, path: '/', method: 'GET' })
    await response.body.dump()
  }

  // Circuit should still be closed - make another request
  const response = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response.statusCode, 500) // 5th request is fail
  await response.body.dump()

  // Still not tripped - do one more
  const response2 = await client.request({ origin, path: '/', method: 'GET' })
  t.equal(response2.statusCode, 200) // 6th is success
  await response2.body.dump()

  t.equal(requestCount, 6)

  await t.completed
})
