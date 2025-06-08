'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { unlink } = require('node:fs/promises')
const { SnapshotRecorder, formatRequestKey, createRequestHash } = require('../lib/mock/snapshot-recorder')

test('SnapshotRecorder - basic recording and retrieval', (t) => {
  const recorder = new SnapshotRecorder()

  const requestOpts = {
    origin: 'https://api.example.com',
    path: '/users/123',
    method: 'GET',
    headers: { 'authorization': 'Bearer token' }
  }

  const response = {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from('{"id": 123, "name": "Test User"}'),
    trailers: {}
  }

  // Record the interaction
  recorder.record(requestOpts, response)

  // Verify it was recorded
  assert.strictEqual(recorder.size(), 1)

  // Retrieve the snapshot
  const snapshot = recorder.findSnapshot(requestOpts)
  assert(snapshot)
  assert.strictEqual(snapshot.request.method, 'GET')
  assert.strictEqual(snapshot.request.url, 'https://api.example.com/users/123')
  assert.strictEqual(snapshot.response.statusCode, 200)
  // Body is stored as base64 string
  assert.strictEqual(snapshot.response.body, response.body.toString('base64'))
})

test('SnapshotRecorder - request key formatting', (t) => {
  const requestOpts = {
    origin: 'https://api.example.com',
    path: '/search?q=test&limit=10',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token'
    },
    body: '{"filter": "active"}'
  }

  const formatted = formatRequestKey(requestOpts)

  assert.strictEqual(formatted.method, 'POST')
  assert.strictEqual(formatted.url, 'https://api.example.com/search?q=test&limit=10')
  assert.strictEqual(formatted.headers['content-type'], 'application/json')
  assert.strictEqual(formatted.headers.authorization, 'Bearer token')
  assert.strictEqual(formatted.body, '{"filter": "active"}')
})

test('SnapshotRecorder - request hashing', (t) => {
  const request1 = {
    method: 'GET',
    url: 'https://api.example.com/users',
    headers: { 'authorization': 'Bearer token' },
    body: undefined
  }

  const request2 = {
    method: 'GET', 
    url: 'https://api.example.com/users',
    headers: { 'authorization': 'Bearer token' },
    body: undefined
  }

  const request3 = {
    method: 'POST',
    url: 'https://api.example.com/users',
    headers: { 'authorization': 'Bearer token' },
    body: undefined
  }

  const hash1 = createRequestHash(request1)
  const hash2 = createRequestHash(request2)
  const hash3 = createRequestHash(request3)

  // Same requests should have same hash
  assert.strictEqual(hash1, hash2)
  
  // Different requests should have different hashes
  assert.notStrictEqual(hash1, hash3)
  
  // Hashes should be URL-safe base64
  assert(hash1.match(/^[A-Za-z0-9_-]+$/))
})

test('SnapshotRecorder - header normalization', (t) => {
  const requestOpts1 = {
    origin: 'https://api.example.com',
    path: '/test',
    headers: {
      'Content-Type': 'application/json',
      'AUTHORIZATION': 'Bearer token'
    }
  }

  const requestOpts2 = {
    origin: 'https://api.example.com', 
    path: '/test',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer token'
    }
  }

  const formatted1 = formatRequestKey(requestOpts1)
  const formatted2 = formatRequestKey(requestOpts2)

  // Headers should be normalized to lowercase
  assert.deepStrictEqual(formatted1.headers, formatted2.headers)
  assert.strictEqual(formatted1.headers['content-type'], 'application/json')
  assert.strictEqual(formatted1.headers.authorization, 'Bearer token')
})

test('SnapshotRecorder - file persistence', async (t) => {
  const snapshotPath = join(tmpdir(), `test-recorder-${Date.now()}.json`)
  const recorder = new SnapshotRecorder({ snapshotPath })

  t.after(() => unlink(snapshotPath).catch(() => {}))

  // Record some interactions
  await recorder.record(
    { origin: 'https://api.example.com', path: '/users', method: 'GET' },
    { statusCode: 200, headers: {}, body: Buffer.from('user data'), trailers: {} }
  )

  await recorder.record(
    { origin: 'https://api.example.com', path: '/posts', method: 'GET' },
    { statusCode: 200, headers: {}, body: Buffer.from('post data'), trailers: {} }
  )

  assert.strictEqual(recorder.size(), 2)

  // Save to file
  await recorder.saveSnapshots()

  // Create new recorder and load from file
  const newRecorder = new SnapshotRecorder({ snapshotPath })
  await newRecorder.loadSnapshots()

  assert.strictEqual(newRecorder.size(), 2)

  // Verify snapshots were loaded correctly
  const userSnapshot = newRecorder.findSnapshot({
    origin: 'https://api.example.com',
    path: '/users',
    method: 'GET'
  })

  assert(userSnapshot)
  assert.strictEqual(userSnapshot.response.statusCode, 200)
  // Body is now stored as base64 string
  assert.strictEqual(userSnapshot.response.body, Buffer.from('user data').toString('base64'))
})

test('SnapshotRecorder - loading non-existent file', async (t) => {
  const snapshotPath = join(tmpdir(), `non-existent-${Date.now()}.json`)
  const recorder = new SnapshotRecorder({ snapshotPath })

  // Should not throw, just create empty recorder
  await recorder.loadSnapshots()
  assert.strictEqual(recorder.size(), 0)
})

test('SnapshotRecorder - array header handling', (t) => {
  const requestOpts = {
    origin: 'https://api.example.com',
    path: '/test',
    headers: {
      'accept': ['application/json', 'text/plain'],
      'x-custom': 'single-value'
    }
  }

  const formatted = formatRequestKey(requestOpts)
  
  // Array headers should be joined with comma
  assert.strictEqual(formatted.headers.accept, 'application/json, text/plain')
  assert.strictEqual(formatted.headers['x-custom'], 'single-value')
})

test('SnapshotRecorder - query parameter handling', (t) => {
  const requestOpts1 = {
    origin: 'https://api.example.com',
    path: '/search?q=test&sort=date',
    method: 'GET'
  }

  const requestOpts2 = {
    origin: 'https://api.example.com',
    path: '/search?sort=date&q=test', // Different order
    method: 'GET'
  }

  const formatted1 = formatRequestKey(requestOpts1)
  const formatted2 = formatRequestKey(requestOpts2)

  // URLs with different query parameter order should be normalized
  assert.strictEqual(formatted1.url, 'https://api.example.com/search?q=test&sort=date')
  
  // But they should still create different hashes if params are truly different
  const hash1 = createRequestHash(formatted1)
  const hash2 = createRequestHash(formatted2)
  
  // This tests that parameter order matters in our current implementation
  // We might want to normalize parameter order in the future
  assert.notStrictEqual(hash1, hash2)
})

test('SnapshotRecorder - clear functionality', async (t) => {
  const recorder = new SnapshotRecorder()

  // Record some snapshots
  await recorder.record(
    { origin: 'https://api.example.com', path: '/test1' },
    { statusCode: 200, headers: {}, body: Buffer.from('data1'), trailers: {} }
  )

  await recorder.record(
    { origin: 'https://api.example.com', path: '/test2' },
    { statusCode: 200, headers: {}, body: Buffer.from('data2'), trailers: {} }
  )

  assert.strictEqual(recorder.size(), 2)

  // Clear and verify
  recorder.clear()
  assert.strictEqual(recorder.size(), 0)

  // Should not find any snapshots
  const snapshot = recorder.findSnapshot({
    origin: 'https://api.example.com',
    path: '/test1'
  })
  assert.strictEqual(snapshot, undefined)
})