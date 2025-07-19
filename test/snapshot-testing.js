'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { unlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher, request } = require('..')

test('SnapshotAgent - record mode', async (t) => {
  const server = createServer((req, res) => {
    if (req.url === '/test') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Hello World', timestamp: '2024-01-01T00:00:00Z' }))
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-snapshots-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make a request that should be recorded
  const response = await request(`${origin}/test`)
  const body = await response.body.json()

  assert.strictEqual(response.statusCode, 200)
  assert.deepStrictEqual(body, { message: 'Hello World', timestamp: '2024-01-01T00:00:00Z' })

  // Save snapshots
  await agent.saveSnapshots()

  // Verify snapshot was recorded
  const recorder = agent.getRecorder()
  assert.strictEqual(recorder.size(), 1)

  const snapshots = recorder.getSnapshots()
  assert.strictEqual(snapshots.length, 1)
  assert.strictEqual(snapshots[0].request.method, 'GET')
  assert.strictEqual(snapshots[0].request.url, `${origin}/test`)
  assert.strictEqual(snapshots[0].responses[0].statusCode, 200)

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - playback mode', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshots-playback-${Date.now()}.json`)

  // First, create a recording
  const recordingAgent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  // Create a simple server for recording
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('Recorded response')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(recordingAgent)

  // Record the request
  await request(`${origin}/api/test`)
  await recordingAgent.saveSnapshots()

  // Now test playback mode
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath
  })

  setGlobalDispatcher(playbackAgent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // This should use the recorded response, not make a real request
  const response = await request(`${origin}/api/test`)
  const body = await response.body.text()

  assert.strictEqual(response.statusCode, 200)
  assert.strictEqual(body, 'Recorded response')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - update mode', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshots-update-${Date.now()}.json`)

  // Create agent in update mode
  const agent = new SnapshotAgent({
    mode: 'update',
    snapshotPath
  })

  // Create a simple server
  const server = createServer((req, res) => {
    if (req.url === '/existing') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('Existing endpoint')
    } else if (req.url === '/new') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('New endpoint')
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // First request - should be recorded as new
  const response1 = await request(`${origin}/existing`)
  const body1 = await response1.body.text()
  assert.strictEqual(body1, 'Existing endpoint')

  // Save and reload to simulate existing snapshots
  await agent.saveSnapshots()

  // Second request to same endpoint - should use existing snapshot
  const response2 = await request(`${origin}/existing`)
  const body2 = await response2.body.text()
  assert.strictEqual(body2, 'Existing endpoint')

  // Request to new endpoint - should be recorded
  const response3 = await request(`${origin}/new`)
  const body3 = await response3.body.text()
  assert.strictEqual(body3, 'New endpoint')

  // Verify we have 2 different snapshots
  const recorder = agent.getRecorder()
  assert.strictEqual(recorder.size(), 2)

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - handles POST requests with body', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshots-post-${Date.now()}.json`)

  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        received: body,
        method: req.method,
        headers: req.headers
      }))
    })
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  // Record mode
  const recordingAgent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(recordingAgent)

  const requestBody = JSON.stringify({ test: 'data' })
  const response = await request(`${origin}/api/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody
  })

  const responseBody = await response.body.json()
  assert.strictEqual(responseBody.received, requestBody)
  assert.strictEqual(responseBody.method, 'POST')

  await recordingAgent.saveSnapshots()

  // Playback mode
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath
  })

  setGlobalDispatcher(playbackAgent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make the same request - should get recorded response
  const playbackResponse = await request(`${origin}/api/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody
  })

  const playbackBody = await playbackResponse.body.json()
  assert.strictEqual(playbackBody.received, requestBody)
  assert.strictEqual(playbackBody.method, 'POST')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - error handling in playback mode', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshots-error-${Date.now()}.json`)

  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath // File doesn't exist
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // This should throw because no snapshot exists for this request
  let errorThrown = false
  try {
    await request('http://localhost:9999/nonexistent')
  } catch (error) {
    errorThrown = true
    assert.strictEqual(error.name, 'UndiciError')
    assert(error.message.includes('No snapshot found for GET /nonexistent'))
    assert.strictEqual(error.code, 'UND_ERR')
  }

  assert(errorThrown, 'Expected an error to be thrown')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - snapshot file format', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshots-format-${Date.now()}.json`)

  const server = createServer((req, res) => {
    res.writeHead(200, { 'x-custom-header': 'test-value' })
    res.end('Test response')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  await request(`${origin}/test-endpoint`)
  await agent.saveSnapshots()

  // Read and verify the snapshot file format
  const { readFile } = require('node:fs/promises')
  const snapshotData = JSON.parse(await readFile(snapshotPath, 'utf8'))

  assert(Array.isArray(snapshotData))
  assert.strictEqual(snapshotData.length, 1)

  const snapshot = snapshotData[0]
  assert(typeof snapshot.hash === 'string')
  assert(typeof snapshot.snapshot === 'object')

  const { request: req, responses, timestamp } = snapshot.snapshot
  assert.strictEqual(req.method, 'GET')
  assert.strictEqual(req.url, `${origin}/test-endpoint`)
  assert.strictEqual(responses[0].statusCode, 200)

  // Headers should be normalized to lowercase
  assert(responses[0].headers['x-custom-header'], 'Expected x-custom-header to be present')
  assert.strictEqual(responses[0].headers['x-custom-header'], 'test-value')
  assert(typeof timestamp === 'string')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - constructor options validation', async (t) => {
  // Test invalid mode
  assert.throws(() => {
    return new SnapshotAgent({ mode: 'invalid' })
  }, {
    name: 'InvalidArgumentError',
    message: /Invalid snapshot mode: invalid\. Must be one of: record, playback, update/
  })

  // Test missing snapshotPath for playback mode
  assert.throws(() => {
    return new SnapshotAgent({ mode: 'playback' })
  }, {
    name: 'InvalidArgumentError',
    message: /snapshotPath is required when mode is 'playback'/
  })

  // Test missing snapshotPath for update mode
  assert.throws(() => {
    return new SnapshotAgent({ mode: 'update' })
  }, {
    name: 'InvalidArgumentError',
    message: /snapshotPath is required when mode is 'update'/
  })

  // Test valid configurations should not throw
  assert.doesNotThrow(() => {
    const agent1 = new SnapshotAgent({ mode: 'record' })
    return agent1.close()
  })

  assert.doesNotThrow(() => {
    const snapshotPath = join(tmpdir(), `test-valid-${Date.now()}.json`)
    const agent2 = new SnapshotAgent({ mode: 'playback', snapshotPath })
    return agent2.close()
  })

  assert.doesNotThrow(() => {
    const snapshotPath = join(tmpdir(), `test-valid-${Date.now()}.json`)
    const agent3 = new SnapshotAgent({ mode: 'update', snapshotPath })
    return agent3.close()
  })
})

test('SnapshotAgent - maxSnapshots and LRU eviction', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`Response for ${req.url}`)
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-lru-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    maxSnapshots: 2 // Only keep 2 snapshots
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make 3 requests
  await request(`${origin}/first`)
  await request(`${origin}/second`)
  await request(`${origin}/third`)

  const recorder = agent.getRecorder()

  // Should only have 2 snapshots due to LRU eviction
  assert.strictEqual(recorder.size(), 2)

  const snapshots = recorder.getSnapshots()
  const urls = snapshots.map(s => s.request.url)

  // First snapshot should be evicted, should have second and third
  assert(urls.includes(`${origin}/second`))
  assert(urls.includes(`${origin}/third`))
  assert(!urls.includes(`${origin}/first`))

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - auto-flush functionality', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('Auto-flush test')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-autoflush-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    autoFlush: true,
    flushInterval: 100 // Very short interval for testing
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make a request
  await request(`${origin}/autoflush-test`)

  // Wait for auto-flush to trigger and ensure it completes
  await new Promise(resolve => setTimeout(resolve, 200))

  // Force a final flush to ensure all data is written
  await agent.saveSnapshots()

  // Verify file was written automatically
  const { readFile } = require('node:fs/promises')
  const fileData = await readFile(snapshotPath, 'utf8')
  const snapshots = JSON.parse(fileData)

  assert(Array.isArray(snapshots))
  assert.strictEqual(snapshots.length, 1)
  assert.strictEqual(snapshots[0].snapshot.request.url, `${origin}/autoflush-test`)

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - custom header matching with matchHeaders', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'x-request-id': '12345',
      authorization: 'Bearer secret-token'
    })
    res.end('{"message": "test"}')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-match-headers-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    matchHeaders: ['content-type'] // Only match on content-type header
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make first request with authorization header
  await request(`${origin}/test`, {
    headers: {
      authorization: 'Bearer secret-token',
      'content-type': 'application/json'
    }
  })

  // Save snapshots before switching to playback
  await agent.saveSnapshots()

  // Make second request with different authorization but same content-type
  // This should match the first request due to matchHeaders config
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath,
    matchHeaders: ['content-type']
  })

  t.after(() => playbackAgent.close())
  setGlobalDispatcher(playbackAgent)

  const response = await request(`${origin}/test`, {
    headers: {
      authorization: 'Bearer different-token', // Different auth token
      'content-type': 'application/json' // Same content-type
    }
  })

  assert.strictEqual(response.statusCode, 200)
  const body = await response.body.text()
  assert.strictEqual(body, '{"message": "test"}')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - ignore headers functionality', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ignore headers test')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-ignore-headers-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    ignoreHeaders: ['authorization', 'x-request-id'] // Ignore these for matching
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make first request
  await request(`${origin}/test`, {
    headers: {
      authorization: 'Bearer token1',
      'x-request-id': 'req-123',
      'content-type': 'application/json'
    }
  })

  // Save snapshots before switching to playback
  await agent.saveSnapshots()

  // Switch to playback mode and make request with different ignored headers
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath,
    ignoreHeaders: ['authorization', 'x-request-id']
  })

  t.after(() => playbackAgent.close())
  setGlobalDispatcher(playbackAgent)

  const response = await request(`${origin}/test`, {
    headers: {
      authorization: 'Bearer different-token', // Different (ignored)
      'x-request-id': 'req-456', // Different (ignored)
      'content-type': 'application/json' // Same (not ignored)
    }
  })

  assert.strictEqual(response.statusCode, 200)
  const body = await response.body.text()
  assert.strictEqual(body, 'ignore headers test')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - exclude headers for security', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': 'session=secret123; HttpOnly',
      authorization: 'Bearer server-token'
    })
    res.end('{"data": "sensitive"}')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-exclude-headers-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    excludeHeaders: ['authorization', 'set-cookie'] // Don't store these sensitive headers
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  await request(`${origin}/test`)
  await agent.saveSnapshots()

  // Read snapshot file and verify sensitive headers are not stored
  const { readFile } = require('node:fs/promises')
  const fileData = await readFile(snapshotPath, 'utf8')
  const snapshots = JSON.parse(fileData)

  assert.strictEqual(snapshots.length, 1)
  const snapshot = snapshots[0].snapshot

  // Verify excluded headers are not in stored response
  assert(!snapshot.responses[0].headers.authorization, 'Authorization header should be excluded')
  assert(!snapshot.responses[0].headers['set-cookie'], 'Set-Cookie header should be excluded')
  assert(snapshot.responses[0].headers['content-type'], 'Content-Type header should be preserved')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - query parameter matching control', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`Response for ${req.url}`)
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-query-matching-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    matchQuery: false // Ignore query parameters in matching
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Record request with query parameters
  await request(`${origin}/api/data?timestamp=123&session=abc`)

  // Save snapshots before switching to playback
  await agent.saveSnapshots()

  // Switch to playback with different query parameters
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath,
    matchQuery: false
  })

  t.after(() => playbackAgent.close())
  setGlobalDispatcher(playbackAgent)

  // This should match the recorded request despite different query params
  const response = await request(`${origin}/api/data?timestamp=456&session=xyz`)

  assert.strictEqual(response.statusCode, 200)
  const body = await response.body.text()
  assert.strictEqual(body, 'Response for /api/data?timestamp=123&session=abc')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - body matching control', async (t) => {
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(`{"received": "${body}"}`)
    })
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-body-matching-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath,
    matchBody: false // Ignore request body in matching
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Record request with specific body
  await request(`${origin}/api/submit`, {
    method: 'POST',
    body: 'original-data',
    headers: { 'content-type': 'text/plain' }
  })

  // Save snapshots before switching to playback
  await agent.saveSnapshots()

  // Switch to playback with different body
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath,
    matchBody: false
  })

  t.after(() => playbackAgent.close())
  setGlobalDispatcher(playbackAgent)

  // This should match despite different body content
  const response = await request(`${origin}/api/submit`, {
    method: 'POST',
    body: 'different-data',
    headers: { 'content-type': 'text/plain' }
  })

  assert.strictEqual(response.statusCode, 200)
  const responseBody = await response.body.json()
  assert.strictEqual(responseBody.received, 'original-data')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - sequential response support', async (t) => {
  const responses = ['First response', 'Second response', 'Third response']
  let callCount = 0

  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(responses[callCount] || responses[responses.length - 1])
    callCount++
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-sequential-${Date.now()}.json`)

  // Record multiple responses to the same endpoint
  const recordingAgent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  t.after(() => recordingAgent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(recordingAgent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Make multiple requests to record sequential responses
  await request(`${origin}/api/test`)
  await request(`${origin}/api/test`)
  await request(`${origin}/api/test`)

  await recordingAgent.saveSnapshots()

  // Switch to playback mode and test sequential responses
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath
  })

  t.after(() => playbackAgent.close())
  setGlobalDispatcher(playbackAgent)

  // First call should return first response
  const response1 = await request(`${origin}/api/test`)
  const body1 = await response1.body.text()
  assert.strictEqual(body1, 'First response')

  // Second call should return second response
  const response2 = await request(`${origin}/api/test`)
  const body2 = await response2.body.text()
  assert.strictEqual(body2, 'Second response')

  // Third call should return third response
  const response3 = await request(`${origin}/api/test`)
  const body3 = await response3.body.text()
  assert.strictEqual(body3, 'Third response')

  // Fourth call should repeat the last response
  const response4 = await request(`${origin}/api/test`)
  const body4 = await response4.body.text()
  assert.strictEqual(body4, 'Third response')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - call count reset functionality', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('Test response')
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-reset-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Record a snapshot
  await request(`${origin}/api/test`)
  await agent.saveSnapshots()

  // Check initial call count
  const info1 = agent.getSnapshotInfo({
    origin,
    path: '/api/test',
    method: 'GET'
  })
  assert(info1)
  assert.strictEqual(info1.callCount, 0) // Call count is only incremented during findSnapshot

  // Reset call counts
  agent.resetCallCounts()

  const info2 = agent.getSnapshotInfo({
    origin,
    path: '/api/test',
    method: 'GET'
  })
  assert(info2)
  assert.strictEqual(info2.callCount, 0)

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})

test('SnapshotAgent - snapshot management methods', async (t) => {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(`Response for ${req.url}`)
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  const snapshotPath = join(tmpdir(), `test-management-${Date.now()}.json`)
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  })

  t.after(() => agent.close())

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Record multiple snapshots
  await request(`${origin}/api/users`)
  await request(`${origin}/api/posts`)

  // Test getSnapshotInfo
  const userInfo = agent.getSnapshotInfo({
    origin,
    path: '/api/users',
    method: 'GET'
  })
  assert(userInfo)
  assert.strictEqual(userInfo.request.method, 'GET')
  assert.strictEqual(userInfo.request.url, `${origin}/api/users`)
  assert.strictEqual(userInfo.responseCount, 1)

  // Test deleteSnapshot
  const deleted = agent.deleteSnapshot({
    origin,
    path: '/api/users',
    method: 'GET'
  })
  assert.strictEqual(deleted, true)

  // Verify deletion
  const deletedInfo = agent.getSnapshotInfo({
    origin,
    path: '/api/users',
    method: 'GET'
  })
  assert.strictEqual(deletedInfo, null)

  // Post snapshot should still exist
  const postInfo = agent.getSnapshotInfo({
    origin,
    path: '/api/posts',
    method: 'GET'
  })
  assert(postInfo)

  // Test replaceSnapshots - create a snapshot with proper hash
  const { createRequestHash, formatRequestKey } = require('../lib/mock/snapshot-recorder')
  const mockRequestOpts = {
    origin,
    path: '/api/mock',
    method: 'GET'
  }
  const mockRequest = formatRequestKey(mockRequestOpts)
  const mockHash = createRequestHash(mockRequest)

  const mockData = [
    {
      hash: mockHash,
      snapshot: {
        request: mockRequest,
        responses: [{ statusCode: 200, headers: {}, body: 'bW9jaw==', trailers: {} }],
        callCount: 0,
        timestamp: new Date().toISOString()
      }
    }
  ]

  agent.replaceSnapshots(mockData)

  // Should only have the mock snapshot now
  const recorder = agent.getRecorder()
  assert.strictEqual(recorder.size(), 1)

  const mockInfo = agent.getSnapshotInfo(mockRequestOpts)
  assert(mockInfo)
  assert.strictEqual(mockInfo.request.url, `${origin}/api/mock`)

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})
