const { SnapshotAgent, setGlobalDispatcher, getGlobalDispatcher, fetch } = require('../../index.js')
const { test } = require('node:test')
const assert = require('node:assert')

/**
 * Example: Snapshot Testing with External APIs
 * 
 * This example demonstrates how to use SnapshotAgent to record real API 
 * interactions and replay them in tests for consistent, offline testing.
 */

// Example 1: Recording API interactions
async function recordApiInteractions() {
  console.log('📹 Recording API interactions...')
  
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath: './examples/snapshots/github-api.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  
  try {
    // Record interactions with GitHub API
    const response = await fetch('https://api.github.com/repos/nodejs/undici')
    const repo = await response.json()
    
    console.log(`✅ Recorded response for ${repo.full_name}`)
    console.log(`   Stars: ${repo.stargazers_count}`)
    console.log(`   Language: ${repo.language}`)
    
    // Save the snapshots
    await agent.saveSnapshots()
    console.log('💾 Snapshots saved successfully')
    
  } finally {
    setGlobalDispatcher(originalDispatcher)
  }
}

// Example 2: Using snapshots in tests
test('GitHub API integration test', async (t) => {
  console.log('🧪 Running test with recorded snapshots...')
  
  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './examples/snapshots/github-api.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))
  
  // This will use the recorded response instead of making a real request
  const response = await fetch('https://api.github.com/repos/nodejs/undici')
  const repo = await response.json()
  
  // Test the recorded data
  assert.strictEqual(repo.name, 'undici')
  assert.strictEqual(repo.owner.login, 'nodejs')
  assert.strictEqual(typeof repo.stargazers_count, 'number')
  assert(repo.stargazers_count > 0)
  
  console.log('✅ Test passed using recorded data')
})

// Example 3: POST request with body
async function recordPostRequest() {
  console.log('📹 Recording POST request...')
  
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath: './examples/snapshots/post-example.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  
  try {
    // Record a POST request to JSONPlaceholder API
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Post',
        body: 'This is a test post created by undici snapshot testing',
        userId: 1
      })
    })
    
    const createdPost = await response.json()
    console.log(`✅ Recorded POST response - Created post ID: ${createdPost.id}`)
    
    await agent.saveSnapshots()
    
  } finally {
    setGlobalDispatcher(originalDispatcher)
  }
}

// Example 4: Update mode (record new, use existing)
async function demonstrateUpdateMode() {
  console.log('🔄 Demonstrating update mode...')
  
  const agent = new SnapshotAgent({
    mode: 'update',
    snapshotPath: './examples/snapshots/update-example.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  
  try {
    // First request - will be recorded if not exists
    const response1 = await fetch('https://httpbin.org/uuid')
    const uuid1 = await response1.json()
    console.log(`Request 1 UUID: ${uuid1.uuid}`)
    
    // Second request to same endpoint - will use recorded response
    const response2 = await fetch('https://httpbin.org/uuid')
    const uuid2 = await response2.json()
    console.log(`Request 2 UUID: ${uuid2.uuid}`)
    
    // They should be the same because the second uses the snapshot
    console.log(`UUIDs match: ${uuid1.uuid === uuid2.uuid}`)
    
    await agent.saveSnapshots()
    
  } finally {
    setGlobalDispatcher(originalDispatcher)
  }
}

// Example 5: Error handling
test('snapshot error handling', async (t) => {
  console.log('🚨 Testing error handling...')
  
  const agent = new SnapshotAgent({
    mode: 'playback',
    snapshotPath: './examples/snapshots/nonexistent.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  t.after(() => setGlobalDispatcher(originalDispatcher))
  
  try {
    await fetch('https://api.example.com/not-recorded')
    assert.fail('Should have thrown an error')
  } catch (error) {
    assert(error.message.includes('No snapshot found'))
    console.log('✅ Correctly threw error for missing snapshot')
  }
})

// Example 6: Working with different request methods
async function recordMultipleRequestTypes() {
  console.log('📹 Recording multiple request types...')
  
  const agent = new SnapshotAgent({
    mode: 'record',
    snapshotPath: './examples/snapshots/http-methods.json'
  })
  
  const originalDispatcher = getGlobalDispatcher()
  setGlobalDispatcher(agent)
  
  try {
    const baseUrl = 'https://httpbin.org'
    
    // GET request
    const getResponse = await fetch(`${baseUrl}/get?param=value`)
    const getData = await getResponse.json()
    console.log(`✅ Recorded GET: ${getData.url}`)
    
    // POST request
    const postResponse = await fetch(`${baseUrl}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' })
    })
    const postData = await postResponse.json()
    console.log(`✅ Recorded POST: ${postData.url}`)
    
    // PUT request
    const putResponse = await fetch(`${baseUrl}/put`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update: 'value' })
    })
    const putData = await putResponse.json()
    console.log(`✅ Recorded PUT: ${putData.url}`)
    
    await agent.saveSnapshots()
    console.log('💾 All HTTP methods recorded')
    
  } finally {
    setGlobalDispatcher(originalDispatcher)
  }
}

// Helper function to create snapshot directory
async function ensureSnapshotDirectory() {
  const { mkdir } = require('node:fs/promises')
  try {
    await mkdir('./examples/snapshots', { recursive: true })
  } catch (error) {
    // Directory might already exist
  }
}

// Main execution
async function main() {
  console.log('🚀 Undici SnapshotAgent Examples\n')
  
  await ensureSnapshotDirectory()
  
  // Only record if we're in record mode
  if (process.env.SNAPSHOT_MODE === 'record') {
    console.log('🔴 RECORD MODE - Making real API calls\n')
    
    try {
      await recordApiInteractions()
      console.log()
      
      await recordPostRequest()
      console.log()
      
      await recordMultipleRequestTypes()
      console.log()
      
    } catch (error) {
      console.error('❌ Error during recording:', error.message)
    }
  }
  
  // Always run the demonstrations
  console.log('▶️  Running demonstrations and tests\n')
  
  try {
    await demonstrateUpdateMode()
    console.log()
    
  } catch (error) {
    console.error('❌ Error during demonstrations:', error.message)
  }
}

// Export for testing
module.exports = {
  recordApiInteractions,
  recordPostRequest,
  demonstrateUpdateMode,
  recordMultipleRequestTypes
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error)
}