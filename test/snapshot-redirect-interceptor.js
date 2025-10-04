'use strict'

const { test } = require('node:test')
const { createServer } = require('node:http')
const { promisify } = require('node:util')
const { unlink } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher, request } = require('..')

test('SnapshotAgent - integration with redirect interceptor', async (t) => {
  const snapshotPath = join(tmpdir(), `test-snapshot-redirect-${Date.now()}.json`)
  const originalDispatcher = getGlobalDispatcher()

  t.after(() => unlink(snapshotPath).catch(() => {}))
  t.after(() => setGlobalDispatcher(originalDispatcher))

  // Create a server that handles redirects
  const server = createServer((req, res) => {
    if (req.url === '/redirect-start') {
      res.writeHead(302, { location: '/redirect-target' })
      res.end('Redirecting...')
    } else if (req.url === '/redirect-target') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ message: 'Final destination' }))
    } else {
      res.writeHead(404)
      res.end('Not Found')
    }
  })

  await promisify(server.listen.bind(server))(0)
  const { port } = server.address()
  const origin = `http://localhost:${port}`

  t.after(() => server.close())

  // Demonstrates the intended usage pattern: SnapshotAgent and redirect interceptor together
  const { interceptors, Agent } = require('..')

  // First use redirect interceptor to capture the complete redirect flow
  const redirectAgent = new Agent().compose(interceptors.redirect({ maxRedirections: 5 }))
  setGlobalDispatcher(redirectAgent)

  const redirectResponse = await request(`${origin}/redirect-start`)
  const redirectBody = await redirectResponse.body.json()

  // Verify redirect worked
  t.assert.strictEqual(redirectResponse.statusCode, 200)
  t.assert.deepStrictEqual(redirectBody, { message: 'Final destination' })
  t.assert.ok(redirectResponse.context && redirectResponse.context.history)
  t.assert.strictEqual(redirectResponse.context.history.length, 2)

  await redirectAgent.close()

  // Record redirected responses using SnapshotAgent with redirect interceptor
  // This tests the fixed integration where SnapshotAgent automatically records final responses
  const recordingAgent = new SnapshotAgent({
    mode: 'record',
    snapshotPath
  }).compose(interceptors.redirect({ maxRedirections: 5 }))

  setGlobalDispatcher(recordingAgent)

  // Make request to redirect URL - should automatically record the final response
  const recordingResponse = await request(`${origin}/redirect-start`)
  const recordingBody = await recordingResponse.body.json()

  // Verify that we got the final response (not the 302)
  t.assert.strictEqual(recordingResponse.statusCode, 200)
  t.assert.deepStrictEqual(recordingBody, { message: 'Final destination' })
  // Note: context.history is not preserved in SnapshotAgent recording mode
  // since we capture the final response directly

  await recordingAgent.close()

  // Playback mode - SnapshotAgent provides recorded responses
  // In playback mode, SnapshotAgent returns the recorded final response directly
  // Also include redirect interceptor to handle any redirect scenarios consistently
  const playbackAgent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath
  }).compose(interceptors.redirect({ maxRedirections: 5 }))

  setGlobalDispatcher(playbackAgent)

  // This should return the recorded final response directly from snapshot
  const playbackResponse = await request(`${origin}/redirect-start`)
  const playbackBody = await playbackResponse.body.json()

  t.assert.strictEqual(playbackResponse.statusCode, 200)
  t.assert.deepStrictEqual(playbackBody, { message: 'Final destination' })

  // In playback mode, context is not preserved since we're replaying recorded responses
  // The important thing is that we get the correct final response content

  // Verify the snapshot recorded the redirect request with final response
  const playbackRecorder = playbackAgent.getRecorder()
  t.assert.strictEqual(playbackRecorder.size(), 2, 'Should have two snapshots')

  const snapshots = playbackRecorder.getSnapshots()

  {
    const snapshot = snapshots[0]
    t.assert.strictEqual(snapshot.request.url, `${origin}/redirect-start`)
    t.assert.strictEqual(snapshot.responses[0].statusCode, 302)
    t.assert.strictEqual(Buffer.from(snapshot.responses[0].body, 'base64').toString(), 'Redirecting...')
  }

  {
    const snapshot = snapshots[1]
    t.assert.strictEqual(snapshot.request.url, `${origin}/redirect-target`)
    t.assert.strictEqual(snapshot.responses[0].statusCode, 200)
    t.assert.deepStrictEqual(JSON.parse(Buffer.from(snapshot.responses[0].body, 'base64')), {
      message: 'Final destination'
    })
  }

  await playbackAgent.close()
})
