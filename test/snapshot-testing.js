'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { unlink, mkdir } = require('node:fs/promises')
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
  assert.strictEqual(snapshots[0].response.statusCode, 200)

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

  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // This should throw because no snapshot exists for this request
  try {
    await request('http://localhost:9999/nonexistent')
    assert.fail('Expected request to throw')
  } catch (error) {
    assert.match(error.message, /No snapshot found for GET \/nonexistent/)
  }

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
  
  const { request: req, response: res, timestamp } = snapshot.snapshot
  assert.strictEqual(req.method, 'GET')
  assert.strictEqual(req.url, `${origin}/test-endpoint`)
  assert.strictEqual(res.statusCode, 200)
  
  // Debug headers
  console.log('Response headers:', JSON.stringify(res.headers, null, 2))
  
  // Headers should be normalized to lowercase
  assert(res.headers['x-custom-header'], 'Expected x-custom-header to be present')
  assert.strictEqual(res.headers['x-custom-header'], 'test-value')
  assert(typeof timestamp === 'string')

  // Cleanup
  t.after(() => unlink(snapshotPath).catch(() => {}))
})