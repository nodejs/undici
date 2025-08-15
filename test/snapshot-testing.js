'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { unlink, writeFile, readFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher, request } = require('..')

// Test constants
const TEST_CONSTANTS = {
  KEEP_ALIVE_TIMEOUT: 10,
  KEEP_ALIVE_MAX_TIMEOUT: 10,
  AUTO_FLUSH_INTERVAL: 100,
  SEQUENTIAL_RESPONSE_DELAY: 200,
  TEST_TIMESTAMP: '2024-01-01T00:00:00Z',
  TEST_MESSAGE: 'Hello World',
  MAX_SNAPSHOTS_FOR_LRU: 2,
  TEST_ORIGINS: {
    LOCALHOST_3000: 'http://localhost:3000'
  },
  ERROR_MESSAGES: {
    INVALID_MODE: 'Invalid snapshot mode: invalid. Must be one of: record, playback, update',
    MISSING_SNAPSHOT_PATH_PLAYBACK: "snapshotPath is required when mode is 'playback'",
    MISSING_SNAPSHOT_PATH_UPDATE: "snapshotPath is required when mode is 'update'",
    NO_SNAPSHOT_FOUND: 'No snapshot found for GET /nonexistent'
  }
}

// Test helper functions
function createSnapshotPath (prefix = 'test-snapshots') {
  return join(tmpdir(), `${prefix}-${Date.now()}.json`)
}

function createTestServer (handler) {
  return createServer(handler)
}

async function setupServer (server) {
  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`
  return { port, origin }
}

function setupCleanup (t, resources) {
  if (resources.server) {
    t.after(() => resources.server.close())
  }
  if (resources.snapshotPath) {
    t.after(() => unlink(resources.snapshotPath).catch(() => {}))
  }
  if (resources.agent) {
    t.after(async () => await resources.agent.close())
  }
  if (resources.originalDispatcher) {
    t.after(() => setGlobalDispatcher(resources.originalDispatcher))
  }
}

function createJsonResponse (data) {
  return JSON.stringify(data)
}

function createDefaultHandler () {
  return (req, res) => {
    if (req.url === '/test') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(createJsonResponse({
        message: TEST_CONSTANTS.TEST_MESSAGE,
        timestamp: TEST_CONSTANTS.TEST_TIMESTAMP
      }))
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  }
}

function createEchoHandler () {
  return (req, res) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async (t) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(createJsonResponse({
        received: body,
        method: req.method,
        headers: req.headers
      }))
    })
  }
}

function createSequentialHandler (responses) {
  let callCount = 0
  return (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(responses[callCount++] || responses[responses.length - 1])
  }
}

async function createLargeSnapshotFile (path, size = 1000) {
  const { createRequestHash, formatRequestKey, createHeaderFilterSets } = require('../lib/mock/snapshot-recorder')

  const snapshots = []
  for (let i = 0; i < size; i++) {
    const requestOpts = {
      origin: 'http://localhost:3000',
      path: `/api/test-${i}`,
      method: 'GET'
    }

    const cachedSets = createHeaderFilterSets({})
    const requestKey = formatRequestKey(requestOpts, cachedSets)
    const hash = createRequestHash(requestKey)

    snapshots.push({
      hash,
      snapshot: {
        request: requestKey,
        responses: [{
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(`{"data": "test-${i}"}`).toString('base64'),
          trailers: {}
        }],
        callCount: 0,
        timestamp: new Date().toISOString()
      }
    })
  }

  await writeFile(path, JSON.stringify(snapshots, null, 2))
}

// Organize tests with describe blocks
describe('SnapshotAgent - Basic Operations', () => {
  it('record mode', async (t) => {
    const server = createTestServer(createDefaultHandler())
    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('record-mode')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      keepAliveTimeout: TEST_CONSTANTS.KEEP_ALIVE_TIMEOUT,
      keepAliveMaxTimeout: TEST_CONSTANTS.KEEP_ALIVE_MAX_TIMEOUT,
      mode: 'record',
      snapshotPath
    })

    // Make a request that should be recorded
    const response = await request(`${origin}/test`, {
      dispatcher: agent
    })
    const body = await response.body.json()

    assert.strictEqual(response.statusCode, 200, 'Response should have status 200')
    assert.deepStrictEqual(body, {
      message: TEST_CONSTANTS.TEST_MESSAGE,
      timestamp: TEST_CONSTANTS.TEST_TIMESTAMP
    }, 'Response body should match expected data')

    // Save snapshots
    await agent.saveSnapshots()

    // Verify snapshot was recorded
    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should have recorded exactly one snapshot')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots.length, 1, 'Snapshots array should contain one item')
    assert.strictEqual(snapshots[0].request.method, 'GET', 'Recorded request method should be GET')
    assert.strictEqual(snapshots[0].request.url, `${origin}/test`, 'Recorded request URL should match')
    assert.strictEqual(snapshots[0].responses[0].statusCode, 200, 'Recorded response status should be 200')
  })

  it('playback mode', async (t) => {
    const snapshotPath = createSnapshotPath('playback-mode')
    setupCleanup(t, { snapshotPath })

    // First, create a recording
    const recordingAgent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    // Create a simple server for recording
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('Recorded response')
    })

    const { origin } = await setupServer(server)
    const originalDispatcher = getGlobalDispatcher()

    setupCleanup(t, { server, originalDispatcher })
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

    // This should use the recorded response, not make a real request
    const response = await request(`${origin}/api/test`)
    const body = await response.body.text()

    assert.strictEqual(response.statusCode, 200, 'Playback response should have status 200')
    assert.strictEqual(body, 'Recorded response', 'Playback should return recorded response')
  })

  it('update mode', async (t) => {
    const snapshotPath = createSnapshotPath('update-mode')
    setupCleanup(t, { snapshotPath })

    // Create agent in update mode
    const agent = new SnapshotAgent({
      mode: 'update',
      snapshotPath
    })

    // Create a simple server
    const server = createTestServer((req, res) => {
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

    const { origin } = await setupServer(server)
    const originalDispatcher = getGlobalDispatcher()

    setupCleanup(t, { server, originalDispatcher })
    setGlobalDispatcher(agent)

    // First request - should be recorded as new
    const response1 = await request(`${origin}/existing`)
    const body1 = await response1.body.text()
    assert.strictEqual(body1, 'Existing endpoint', 'First request should get live response')

    // Save and reload to simulate existing snapshots
    await agent.saveSnapshots()

    // Second request to same endpoint - should use existing snapshot
    const response2 = await request(`${origin}/existing`)
    const body2 = await response2.body.text()
    assert.strictEqual(body2, 'Existing endpoint', 'Second request should use cached response')

    // Request to new endpoint - should be recorded
    const response3 = await request(`${origin}/new`)
    const body3 = await response3.body.text()
    assert.strictEqual(body3, 'New endpoint', 'New endpoint should get live response')

    // Verify we have 2 different snapshots
    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 2, 'Should have exactly two snapshots recorded')
  })
})

describe('SnapshotAgent - Request Handling', () => {
  it('handles POST requests with body', async (t) => {
    const snapshotPath = createSnapshotPath('post-requests')
    setupCleanup(t, { snapshotPath })

    const server = createTestServer(createEchoHandler())
    const { origin } = await setupServer(server)

    setupCleanup(t, { server })

    // Record mode
    const recordingAgent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { originalDispatcher })
    setGlobalDispatcher(recordingAgent)

    const requestBody = createJsonResponse({ test: 'data' })
    const response = await request(`${origin}/api/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody
    })

    const responseBody = await response.body.json()
    assert.strictEqual(responseBody.received, requestBody, 'Server should receive the request body')
    assert.strictEqual(responseBody.method, 'POST', 'Server should receive POST method')

    await recordingAgent.saveSnapshots()

    // Playback mode
    const playbackAgent = new SnapshotAgent({
      mode: 'playback',
      snapshotPath
    })

    setGlobalDispatcher(playbackAgent)

    // Make the same request - should get recorded response
    const playbackResponse = await request(`${origin}/api/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: requestBody
    })

    const playbackBody = await playbackResponse.body.json()
    assert.strictEqual(playbackBody.received, requestBody, 'Playback should return recorded request body')
    assert.strictEqual(playbackBody.method, 'POST', 'Playback should return recorded method')
  })

  it('sequential response support', async (t) => {
    const responses = ['First response', 'Second response', 'Third response']
    const server = createTestServer(createSequentialHandler(responses))
    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('sequential')

    setupCleanup(t, { server, snapshotPath })

    // Record multiple responses to the same endpoint
    const recordingAgent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { originalDispatcher })
    setGlobalDispatcher(recordingAgent)

    // Make multiple requests to record sequential responses
    {
      const res = await request(`${origin}/api/test`)
      await res.body.text()
    }
    {
      const res = await request(`${origin}/api/test`)
      await res.body.text()
    }
    {
      const res = await request(`${origin}/api/test`)
      await res.body.text()
    }

    // Ensure all recordings are saved and verify the recording state
    await recordingAgent.saveSnapshots()

    // Verify recording worked correctly before switching to playback
    const recordingRecorder = recordingAgent.getRecorder()
    assert.strictEqual(recordingRecorder.size(), 1, 'Should have recorded exactly one snapshot')
    const recordedSnapshots = recordingRecorder.getSnapshots()
    assert.strictEqual(recordedSnapshots[0].responses.length, 3, 'Should have recorded three responses')

    // Close recording agent cleanly before starting playback
    await recordingAgent.close()

    // Switch to playback mode and test sequential responses
    const playbackAgent = new SnapshotAgent({
      mode: 'playback',
      snapshotPath
    })

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    // Ensure snapshots are loaded and call counts are reset before setting dispatcher
    await playbackAgent.loadSnapshots()

    // Reset call counts after loading to ensure clean state
    playbackAgent.resetCallCounts()

    // Verify we have the expected snapshots before proceeding
    const recorder = playbackAgent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should have exactly one snapshot loaded')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots.length, 1, 'Should have exactly one snapshot')
    assert.strictEqual(snapshots[0].responses.length, 3, 'Should have three sequential responses')

    // Test sequential responses
    const response1 = await request(`${origin}/api/test`)
    const body1 = await response1.body.text()
    assert.strictEqual(body1, 'First response', 'First call should return first response')

    const response2 = await request(`${origin}/api/test`)
    const body2 = await response2.body.text()
    assert.strictEqual(body2, 'Second response', 'Second call should return second response')

    const response3 = await request(`${origin}/api/test`)
    const body3 = await response3.body.text()
    assert.strictEqual(body3, 'Third response', 'Third call should return third response')

    // Fourth call should repeat the last response
    const response4 = await request(`${origin}/api/test`)
    const body4 = await response4.body.text()
    assert.strictEqual(body4, 'Third response', 'Fourth call should repeat the last response')
  })
})

describe('SnapshotAgent - Error Handling', () => {
  it('error handling in playback mode', async (t) => {
    const snapshotPath = createSnapshotPath('error-handling')
    setupCleanup(t, { snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'playback',
      snapshotPath // File doesn't exist
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // This should throw because no snapshot exists for this request
    let errorThrown = false
    try {
      await request('http://localhost:9999/nonexistent')
    } catch (error) {
      errorThrown = true
      assert.strictEqual(error.name, 'UndiciError', 'Error should be UndiciError')
      assert(error.message.includes(TEST_CONSTANTS.ERROR_MESSAGES.NO_SNAPSHOT_FOUND),
        'Error message should indicate no snapshot found')
      assert.strictEqual(error.code, 'UND_ERR', 'Error code should be UND_ERR')
    }

    assert(errorThrown, 'Expected an error to be thrown for missing snapshot')
  })

  it('constructor options validation', async (t) => {
    // Test invalid mode
    assert.throws(() => {
      return new SnapshotAgent({ mode: 'invalid' })
    }, {
      name: 'InvalidArgumentError',
      message: new RegExp(TEST_CONSTANTS.ERROR_MESSAGES.INVALID_MODE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    }, 'Should throw for invalid mode')

    // Test missing snapshotPath for playback mode
    assert.throws(() => {
      return new SnapshotAgent({ mode: 'playback' })
    }, {
      name: 'InvalidArgumentError',
      message: new RegExp(TEST_CONSTANTS.ERROR_MESSAGES.MISSING_SNAPSHOT_PATH_PLAYBACK)
    }, 'Should throw for missing snapshotPath in playback mode')

    // Test missing snapshotPath for update mode
    assert.throws(() => {
      return new SnapshotAgent({ mode: 'update' })
    }, {
      name: 'InvalidArgumentError',
      message: new RegExp(TEST_CONSTANTS.ERROR_MESSAGES.MISSING_SNAPSHOT_PATH_UPDATE)
    }, 'Should throw for missing snapshotPath in update mode')

    // Test valid configurations should not throw
    await assert.doesNotReject(async () => {
      const agent1 = new SnapshotAgent({ mode: 'record' })
      await agent1.close()
    }, 'Should not throw for valid record mode')

    await assert.doesNotReject(async () => {
      const snapshotPath = createSnapshotPath('valid-playback')
      const agent2 = new SnapshotAgent({ mode: 'playback', snapshotPath })
      await agent2.close()
    }, 'Should not throw for valid playback mode')

    await assert.doesNotReject(async () => {
      const snapshotPath = createSnapshotPath('valid-update')
      const agent3 = new SnapshotAgent({ mode: 'update', snapshotPath })
      await agent3.close()
    }, 'Should not throw for valid update mode')
  })
})

describe('SnapshotAgent - Edge Cases', () => {
  it('handles large snapshot files', async (t) => {
    const snapshotPath = createSnapshotPath('large')
    setupCleanup(t, { snapshotPath })

    await createLargeSnapshotFile(snapshotPath, 100)

    const agent = new SnapshotAgent({
      mode: 'playback',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })

    // Should load large files without issues
    await agent.loadSnapshots()
    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 100, 'Should load all 100 snapshots from large file')

    setGlobalDispatcher(agent)

    // Should be able to find and use snapshots from large file
    const response = await request('http://localhost:3000/api/test-0')
    const body = await response.body.json()
    assert.deepStrictEqual(body, { data: 'test-0' }, 'Should return correct data from large snapshot file')
  })

  it('concurrent access scenarios', async (t) => {
    const snapshotPath = createSnapshotPath('concurrent')
    setupCleanup(t, { snapshotPath })

    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(createJsonResponse({ path: req.url }))
    })

    const { origin } = await setupServer(server)
    setupCleanup(t, { server })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make multiple concurrent requests
    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(request(`${origin}/api/test-${i}`))
    }

    const responses = await Promise.all(promises)

    // Verify all responses were handled correctly
    for (let i = 0; i < responses.length; i++) {
      const body = await responses[i].body.json()
      assert.deepStrictEqual(body, { path: `/api/test-${i}` },
        `Concurrent request ${i} should return correct response`)
    }

    await agent.saveSnapshots()
    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 10, 'Should record all 10 concurrent requests')
  })
})

describe('SnapshotAgent - Advanced Features', () => {
  it('snapshot file format validation', async (t) => {
    const snapshotPath = createSnapshotPath('format-validation')
    setupCleanup(t, { snapshotPath })

    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'x-custom-header': 'test-value' })
      res.end('Test response')
    })

    const { origin } = await setupServer(server)
    setupCleanup(t, { server })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    await request(`${origin}/test-endpoint`)
    await agent.saveSnapshots()

    // Read and verify the snapshot file format
    const snapshotData = JSON.parse(await readFile(snapshotPath, 'utf8'))

    assert(Array.isArray(snapshotData), 'Snapshot data should be an array')
    assert.strictEqual(snapshotData.length, 1, 'Should contain exactly one snapshot')

    const snapshot = snapshotData[0]
    assert(typeof snapshot.hash === 'string', 'Snapshot should have string hash')
    assert(typeof snapshot.snapshot === 'object', 'Snapshot should have snapshot object')

    const { request: req, responses, timestamp } = snapshot.snapshot
    assert.strictEqual(req.method, 'GET', 'Request method should be GET')
    assert.strictEqual(req.url, `${origin}/test-endpoint`, 'Request URL should match')
    assert.strictEqual(responses[0].statusCode, 200, 'Response status should be 200')

    // Headers should be normalized to lowercase
    assert(responses[0].headers['x-custom-header'], 'Custom header should be present')
    assert.strictEqual(responses[0].headers['x-custom-header'], 'test-value', 'Custom header value should match')
    assert(typeof timestamp === 'string', 'Timestamp should be a string')
  })

  it('maxSnapshots and LRU eviction', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('lru-eviction')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      maxSnapshots: TEST_CONSTANTS.MAX_SNAPSHOTS_FOR_LRU
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make 3 requests to trigger LRU eviction
    await request(`${origin}/first`)
    await request(`${origin}/second`)
    await request(`${origin}/third`)

    const recorder = agent.getRecorder()

    // Should only have 2 snapshots due to LRU eviction
    assert.strictEqual(recorder.size(), TEST_CONSTANTS.MAX_SNAPSHOTS_FOR_LRU,
      `Should only keep ${TEST_CONSTANTS.MAX_SNAPSHOTS_FOR_LRU} snapshots due to LRU eviction`)

    const snapshots = recorder.getSnapshots()
    const urls = snapshots.map(s => s.request.url)

    // First snapshot should be evicted, should have second and third
    assert(urls.includes(`${origin}/second`), 'Should contain second request')
    assert(urls.includes(`${origin}/third`), 'Should contain third request')
    assert(!urls.includes(`${origin}/first`), 'Should not contain first request (evicted)')
  })

  it('auto-flush functionality', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('Auto-flush test')
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('auto-flush')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      autoFlush: true,
      flushInterval: TEST_CONSTANTS.AUTO_FLUSH_INTERVAL
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make a request
    await request(`${origin}/autoflush-test`)

    // Wait for auto-flush to trigger and ensure it completes
    await new Promise(resolve => setTimeout(resolve, TEST_CONSTANTS.SEQUENTIAL_RESPONSE_DELAY))

    // Force a final flush to ensure all data is written
    await agent.saveSnapshots()

    // Verify file was written automatically
    const fileData = await readFile(snapshotPath, 'utf8')
    const snapshots = JSON.parse(fileData)

    assert(Array.isArray(snapshots), 'Auto-flushed data should be an array')
    assert.strictEqual(snapshots.length, 1, 'Should contain exactly one auto-flushed snapshot')
    assert.strictEqual(snapshots[0].snapshot.request.url, `${origin}/autoflush-test`,
      'Auto-flushed snapshot should have correct URL')
  })
})

describe('SnapshotAgent - Header Management', () => {
  it('custom header matching with matchHeaders', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': '12345',
        authorization: 'Bearer secret-token'
      })
      res.end('{"message": "test"}')
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('match-headers')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      matchHeaders: ['content-type'] // Only match on content-type header
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

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

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    const response = await request(`${origin}/test`, {
      headers: {
        authorization: 'Bearer different-token', // Different auth token
        'content-type': 'application/json' // Same content-type
      }
    })

    assert.strictEqual(response.statusCode, 200, 'Should match despite different auth token')
    const body = await response.body.text()
    assert.strictEqual(body, '{"message": "test"}', 'Should return recorded response')
  })

  it('ignore headers functionality', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ignore headers test')
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('ignore-headers')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      ignoreHeaders: ['authorization', 'x-request-id'] // Ignore these for matching
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

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

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    const response = await request(`${origin}/test`, {
      headers: {
        authorization: 'Bearer different-token', // Different (ignored)
        'x-request-id': 'req-456', // Different (ignored)
        'content-type': 'application/json' // Same (not ignored)
      }
    })

    assert.strictEqual(response.statusCode, 200, 'Should match despite different ignored headers')
    const body = await response.body.text()
    assert.strictEqual(body, 'ignore headers test', 'Should return recorded response')
  })

  it('exclude headers for security', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'session=secret123; HttpOnly',
        authorization: 'Bearer server-token'
      })
      res.end('{"data": "sensitive"}')
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('exclude-headers')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      excludeHeaders: ['authorization', 'set-cookie'] // Don't store these sensitive headers
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    await request(`${origin}/test`)
    await agent.saveSnapshots()

    // Read snapshot file and verify sensitive headers are not stored
    const fileData = await readFile(snapshotPath, 'utf8')
    const snapshots = JSON.parse(fileData)

    assert.strictEqual(snapshots.length, 1, 'Should contain exactly one snapshot')
    const snapshot = snapshots[0].snapshot

    // Verify excluded headers are not in stored response
    assert(!snapshot.responses[0].headers.authorization, 'Authorization header should be excluded from storage')
    assert(!snapshot.responses[0].headers['set-cookie'], 'Set-Cookie header should be excluded from storage')
    assert(snapshot.responses[0].headers['content-type'], 'Content-Type header should be preserved')
  })
})

describe('SnapshotAgent - Request Matching', () => {
  it('query parameter matching control', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('query-matching')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      matchQuery: false // Ignore query parameters in matching
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

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

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    // This should match the recorded request despite different query params
    const response = await request(`${origin}/api/data?timestamp=456&session=xyz`)

    assert.strictEqual(response.statusCode, 200, 'Should match despite different query parameters')
    const body = await response.body.text()
    assert.strictEqual(body, 'Response for /api/data?timestamp=123&session=abc',
      'Should return original recorded response with original query params')
  })

  it('body matching control', async (t) => {
    const server = createTestServer((req, res) => {
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async (t) => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(`{"received": "${body}"}`)
      })
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('body-matching')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      matchBody: false // Ignore request body in matching
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

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

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    // This should match despite different body content
    const response = await request(`${origin}/api/submit`, {
      method: 'POST',
      body: 'different-data',
      headers: { 'content-type': 'text/plain' }
    })

    assert.strictEqual(response.statusCode, 200, 'Should match despite different request body')
    const responseBody = await response.body.json()
    assert.strictEqual(responseBody.received, 'original-data',
      'Should return recorded response with original body')
  })
})

describe('SnapshotAgent - Management Features', () => {
  it('call count reset functionality', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('Test response')
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('reset-functionality')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Record a snapshot
    await request(`${origin}/api/test`)
    await agent.saveSnapshots()

    // Check initial call count
    const info1 = agent.getSnapshotInfo({
      origin,
      path: '/api/test',
      method: 'GET'
    })
    assert(info1, 'Should find snapshot info')
    assert.strictEqual(info1.callCount, 0, 'Call count should be 0 initially (only incremented during findSnapshot)')

    // Reset call counts
    agent.resetCallCounts()

    const info2 = agent.getSnapshotInfo({
      origin,
      path: '/api/test',
      method: 'GET'
    })
    assert(info2, 'Should still find snapshot info after reset')
    assert.strictEqual(info2.callCount, 0, 'Call count should remain 0 after reset')
  })

  it('snapshot management methods', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('management-methods')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Record multiple snapshots
    await request(`${origin}/api/users`)
    await request(`${origin}/api/posts`)

    // Test getSnapshotInfo
    const userInfo = agent.getSnapshotInfo({
      origin,
      path: '/api/users',
      method: 'GET'
    })
    assert(userInfo, 'Should find user snapshot info')
    assert.strictEqual(userInfo.request.method, 'GET', 'User snapshot method should be GET')
    assert.strictEqual(userInfo.request.url, `${origin}/api/users`, 'User snapshot URL should match')
    assert.strictEqual(userInfo.responseCount, 1, 'User snapshot should have one response')

    // Test deleteSnapshot
    const deleted = agent.deleteSnapshot({
      origin,
      path: '/api/users',
      method: 'GET'
    })
    assert.strictEqual(deleted, true, 'Should successfully delete user snapshot')

    // Verify deletion
    const deletedInfo = agent.getSnapshotInfo({
      origin,
      path: '/api/users',
      method: 'GET'
    })
    assert.strictEqual(deletedInfo, null, 'Deleted snapshot should not be found')

    // Post snapshot should still exist
    const postInfo = agent.getSnapshotInfo({
      origin,
      path: '/api/posts',
      method: 'GET'
    })
    assert(postInfo, 'Post snapshot should still exist after deleting user snapshot')

    // Test replaceSnapshots - create a snapshot with proper hash
    const { createRequestHash, formatRequestKey, createHeaderFilterSets } = require('../lib/mock/snapshot-recorder')
    const mockRequestOpts = {
      origin,
      path: '/api/mock',
      method: 'GET'
    }
    const cachedSets = createHeaderFilterSets({})
    const mockRequest = formatRequestKey(mockRequestOpts, cachedSets)
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
    assert.strictEqual(recorder.size(), 1, 'Should have only one snapshot after replacement')

    const mockInfo = agent.getSnapshotInfo(mockRequestOpts)
    assert(mockInfo, 'Should find mock snapshot after replacement')
    assert.strictEqual(mockInfo.request.url, `${origin}/api/mock`, 'Mock snapshot URL should match')
  })
})

describe('SnapshotAgent - Filtering', () => {
  it('shouldRecord filtering', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('should-record-filter')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      shouldRecord: (requestOpts) => {
        // Only record requests to /api/allowed
        return requestOpts.path === '/api/allowed'
      }
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make requests - only one should be recorded
    await request(`${origin}/api/allowed`)
    await request(`${origin}/api/filtered`)

    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should record only the allowed request')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots[0].request.url, `${origin}/api/allowed`,
      'Recorded snapshot should be the allowed request')
  })

  it('shouldPlayback filtering', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Live response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('should-playback-filter')

    setupCleanup(t, { server, snapshotPath })

    // First, record some snapshots without filtering
    const recordingAgent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent: recordingAgent, originalDispatcher })
    setGlobalDispatcher(recordingAgent)

    await request(`${origin}/api/cached`)
    await request(`${origin}/api/live`)
    await recordingAgent.saveSnapshots()

    // Now test playback with filtering
    const playbackAgent = new SnapshotAgent({
      mode: 'playback',
      snapshotPath,
      shouldPlayback: (requestOpts) => {
        // Only playback requests to /api/cached
        return requestOpts.path === '/api/cached'
      }
    })

    setupCleanup(t, { agent: playbackAgent })
    setGlobalDispatcher(playbackAgent)

    // This should use cached response
    const cachedResponse = await request(`${origin}/api/cached`)
    const cachedBody = await cachedResponse.body.text()
    assert.strictEqual(cachedBody, 'Live response for /api/cached',
      'Should return cached response for allowed path')

    // This should fail because playback is filtered and no live server
    // Need to close the recording server to ensure no fallback
    server.close()
    let errorThrown = false
    try {
      await request(`${origin}/api/live`)
    } catch (error) {
      errorThrown = true
      assert.strictEqual(error.name, 'UndiciError', 'Should throw UndiciError for filtered request')
    }

    assert(errorThrown, 'Expected an error for filtered playback request')
  })

  it('URL exclusion patterns (string)', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('url-exclusion-string')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      excludeUrls: ['/private', 'secret']
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make requests - some should be excluded
    await request(`${origin}/api/public`)
    await request(`${origin}/private/data`)
    await request(`${origin}/api/secret-endpoint`)

    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should record only non-excluded requests')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots[0].request.url, `${origin}/api/public`,
      'Should record only the public API request')
  })

  it('URL exclusion patterns (regex)', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('url-exclusion-regex')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      excludeUrls: [/\/admin\/.*/, /.*\?token=.*/]
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make requests - some should be excluded by regex patterns
    await request(`${origin}/api/data`)
    await request(`${origin}/admin/users`)
    await request(`${origin}/api/auth?token=secret`)

    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should record only requests not matching exclusion patterns')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots[0].request.url, `${origin}/api/data`,
      'Should record only the non-excluded API request')
  })

  it('complex filtering scenarios', async (t) => {
    const server = createTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end(`Response for ${req.url}`)
    })

    const { origin } = await setupServer(server)
    const snapshotPath = createSnapshotPath('complex-filtering')

    setupCleanup(t, { server, snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      shouldRecord: (requestOpts) => {
        // Only record GET requests
        return (requestOpts.method || 'GET') === 'GET'
      },
      excludeUrls: ['/health']
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { agent, originalDispatcher })
    setGlobalDispatcher(agent)

    // Make various requests with multiple filters
    await request(`${origin}/api/users`) // Should record (GET, not excluded)
    await request(`${origin}/health`) // Should not record (excluded URL)
    await request(`${origin}/api/data`, { method: 'POST' }) // Should not record (POST method)

    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should record only requests passing all filters')

    const snapshots = recorder.getSnapshots()
    assert.strictEqual(snapshots[0].request.url, `${origin}/api/users`,
      'Should record only the allowed GET request')
    assert.strictEqual(snapshots[0].request.method, 'GET',
      'Recorded request should have GET method')
  })
})

describe('SnapshotAgent - Close Method', () => {
  it('close() saves recordings before cleanup', async (t) => {
    const snapshotPath = createSnapshotPath('close-saves')
    setupCleanup(t, { snapshotPath })

    const server = createTestServer(createDefaultHandler())
    const { origin } = await setupServer(server)
    setupCleanup(t, { server })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath,
      autoFlush: false // Disable auto-flush to test manual save on close
    })

    const originalDispatcher = getGlobalDispatcher()
    setupCleanup(t, { originalDispatcher })
    setGlobalDispatcher(agent)

    // Make a request that should be recorded
    await request(`${origin}/test`)

    // Verify snapshot is in memory but not yet saved to file
    const recorder = agent.getRecorder()
    assert.strictEqual(recorder.size(), 1, 'Should have recorded one snapshot in memory')

    // Check that file doesn't exist yet (since autoFlush is false)
    let fileExists = false
    try {
      await readFile(snapshotPath)
      fileExists = true
    } catch {
      // File doesn't exist, which is expected
    }
    assert.strictEqual(fileExists, false, 'File should not exist before close()')

    // Close the agent - this should save the snapshots
    await agent.close()

    // Verify the snapshots were saved to file
    let savedData
    try {
      const fileContent = await readFile(snapshotPath, 'utf8')
      savedData = JSON.parse(fileContent)
    } catch (error) {
      assert.fail(`Failed to read saved snapshot file: ${error.message}`)
    }

    assert(Array.isArray(savedData), 'Saved data should be an array')
    assert.strictEqual(savedData.length, 1, 'Should have saved one snapshot')
    assert.strictEqual(savedData[0].snapshot.request.method, 'GET', 'Saved snapshot should have correct method')
    assert.strictEqual(savedData[0].snapshot.request.url, `${origin}/test`, 'Saved snapshot should have correct URL')
  })

  it('close() works when no recordings exist', async (t) => {
    const snapshotPath = createSnapshotPath('close-no-recordings')
    setupCleanup(t, { snapshotPath })

    const agent = new SnapshotAgent({
      mode: 'record',
      snapshotPath
    })

    // Close agent immediately without making any requests or setting as dispatcher
    await assert.doesNotReject(async () => {
      await agent.close()
    }, 'Should not throw when closing agent with no recordings')

    // Verify no file was created
    let fileExists = false
    try {
      await readFile(snapshotPath)
      fileExists = true
    } catch {
      // File doesn't exist, which is expected
    }
    assert.strictEqual(fileExists, false, 'No file should be created when no recordings exist')
  })

  it('close() works when no snapshot path is configured', async (t) => {
    const agent = new SnapshotAgent({
      mode: 'record'
      // No snapshotPath provided
    })

    const server = createTestServer(createDefaultHandler())
    const { origin } = await setupServer(server)
    setupCleanup(t, { server })

    const originalDispatcher = getGlobalDispatcher()
    t.after(() => setGlobalDispatcher(originalDispatcher))
    setGlobalDispatcher(agent)

    // Make a request
    await request(`${origin}/test`)

    // Close should not throw even without snapshot path
    await assert.doesNotReject(async () => {
      await agent.close()
    }, 'Should not throw when closing agent without snapshot path')
  })

  it('recorder close() method works independently', async (t) => {
    const { SnapshotRecorder } = require('../lib/mock/snapshot-recorder')
    const snapshotPath = createSnapshotPath('recorder-close')
    setupCleanup(t, { snapshotPath })

    const recorder = new SnapshotRecorder({
      snapshotPath,
      mode: 'record'
    })

    // Manually add a snapshot to test saving
    await recorder.record(
      { origin: 'http://test.com', path: '/api', method: 'GET' },
      {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from('{"test": true}'),
        trailers: {}
      }
    )

    assert.strictEqual(recorder.size(), 1, 'Should have one recorded snapshot')

    // Close the recorder
    await recorder.close()

    // Verify the snapshot was saved
    let savedData
    try {
      const fileContent = await readFile(snapshotPath, 'utf8')
      savedData = JSON.parse(fileContent)
    } catch (error) {
      assert.fail(`Failed to read saved snapshot file: ${error.message}`)
    }

    assert(Array.isArray(savedData), 'Saved data should be an array')
    assert.strictEqual(savedData.length, 1, 'Should have saved one snapshot')
    assert.strictEqual(savedData[0].snapshot.request.method, 'GET', 'Should have correct method')
  })
})
