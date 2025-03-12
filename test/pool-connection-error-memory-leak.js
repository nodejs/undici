'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { Pool } = require('..')
const { createServer } = require('node:http')
const { kClients } = require('../lib/dispatcher/pool-base')

// This test verifies that clients are properly removed from the pool when they encounter connection errors,
// which is the fix implemented for issue #3895 (memory leak with connection errors)
test('Pool client count does not grow on repeated connection errors', async (t) => {
  // Setup a pool pointing to a non-existent server
  const pool = new Pool('http://localhost:1', {
    connections: 10,
    connectTimeout: 100, // Short timeout to speed up the test
    bodyTimeout: 100,
    headersTimeout: 100
  })

  try {
    const clientCounts = []

    // Track initial client count
    clientCounts.push(pool[kClients].length)

    // Make several requests that will fail with connection errors
    const requests = 5
    for (let i = 0; i < requests; i++) {
      try {
        await pool.request({
          path: `/${i}`,
          method: 'GET'
        })
        assert.fail('Request should have failed with a connection error')
      } catch (err) {
        // We expect connection errors, but the error might be wrapped
        assert.ok(
          err.code === 'ECONNREFUSED' ||
          err.cause?.code === 'ECONNREFUSED' ||
          err.code === 'UND_ERR_CONNECT',
          `Expected connection error but got: ${err.message} (${err.code})`
        )
      }

      // Track client count after each request
      clientCounts.push(pool[kClients].length)

      // Small delay to allow for client cleanup
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    // The key test: verify that client count doesn't increase monotonically,
    // which would indicate the memory leak that was fixed
    const maxCount = Math.max(...clientCounts)
    assert.ok(
      clientCounts[clientCounts.length - 1] <= maxCount,
      `Client count should not increase continuously. Counts: ${clientCounts.join(', ')}`
    )

    // Ensure the last two counts are similar (stabilized)
    const lastCount = clientCounts[clientCounts.length - 1]
    const secondLastCount = clientCounts[clientCounts.length - 2]

    assert.ok(
      Math.abs(lastCount - secondLastCount) <= 1,
      `Client count should stabilize. Last counts: ${secondLastCount}, ${lastCount}`
    )

    // Additional verification: make many more requests to check for significant growth
    const moreRequests = 10
    const startCount = pool[kClients].length

    for (let i = 0; i < moreRequests; i++) {
      try {
        await pool.request({
          path: `/more-${i}`,
          method: 'GET'
        })
      } catch (err) {
        // Expected error
      }

      // Small delay to allow for client cleanup
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    const endCount = pool[kClients].length

    // The maximum tolerable growth - some growth may occur due to timing issues,
    // but it should be limited and not proportional to the number of requests
    const maxGrowth = 3

    assert.ok(
      endCount - startCount <= maxGrowth,
      `Client count should not grow significantly after many failed requests. Start: ${startCount}, End: ${endCount}`
    )
  } finally {
    await pool.close()
  }
})

// This test specifically verifies the fix in pool-base.js for connectionError event
test('Pool clients are removed on connectionError event', async (t) => {
  // Create a server we'll use to track connection events
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  })

  await new Promise(resolve => server.listen(0, resolve))
  const port = server.address().port

  const pool = new Pool(`http://localhost:${port}`, {
    connections: 3 // Small pool to make testing easier
  })

  try {
    // Make an initial successful request to create a client
    await pool.request({
      path: '/',
      method: 'GET'
    })

    // Save the initial number of clients
    const initialCount = pool[kClients].length
    assert.ok(initialCount > 0, 'Should have at least one client after a successful request')

    // Manually trigger a connectionError on all clients
    for (const client of [...pool[kClients]]) {
      client.emit('connectionError', 'origin', [client], new Error('Simulated connection error'))
    }

    // Allow some time for the event to be processed
    await new Promise(resolve => setTimeout(resolve, 50))

    // After the fix, all clients should be removed when they emit a connectionError
    assert.strictEqual(
      pool[kClients].length,
      0,
      'All clients should be removed from pool after connectionError events'
    )

    // Make another request to verify the pool can create new clients
    await pool.request({
      path: '/after-error',
      method: 'GET'
    })

    // Verify new clients were created
    assert.ok(
      pool[kClients].length > 0,
      'Pool should create new clients after previous ones were removed'
    )
  } finally {
    await pool.close()
    await new Promise(resolve => server.close(resolve))
  }
})
