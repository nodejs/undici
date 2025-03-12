'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { fetch } = require('..')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { closeServerAsPromise } = require('./utils/node-http')

const hasGC = typeof global.gc !== 'undefined'

// This test verifies that there is no memory leak when handling TLS certificate errors.
// It simulates the error by using a server with a self-signed certificate.
test('no memory leak with TLS certificate errors', { timeout: 20000 }, async (t) => {
  if (!hasGC) {
    throw new Error('gc is not available. Run with \'--expose-gc\'.')
  }

  const { ok } = tspl(t, { plan: 1 })

  // Create HTTPS server with self-signed certificate
  const serverOptions = {
    key: fs.readFileSync(path.join(__dirname, 'fixtures', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'cert.pem'))
  }

  // Create a server that always responds with a simple message
  const server = https.createServer(serverOptions, (req, res) => {
    res.writeHead(200)
    res.end('test response')
  })

  // Start server on a random port
  await new Promise(resolve => server.listen(0, resolve))
  const serverUrl = `https://localhost:${server.address().port}`

  t.after(closeServerAsPromise(server))

  // Function to make a request that will trigger a certificate error
  async function makeRequest (i) {
    try {
      // The request will fail with CERT_SIGNATURE_FAILURE or similar
      // because we're using a self-signed certificate and not telling
      // Node.js to accept it
      const res = await fetch(`${serverUrl}/request-${i}`, {
        signal: AbortSignal.timeout(2000) // Short timeout to prevent hanging
      })
      const text = await res.text()
      return { status: res.status, text }
    } catch (e) {
      // In real code, without the fix, this would leak memory
      if (e?.cause?.code === 'CERT_SIGNATURE_FAILURE' ||
          e?.cause?.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          e?.cause?.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        return { status: 524, text: 'Certificate Error' }
      }
      // Return for any other error to avoid test interruption
      return { status: 500, text: e.message }
    }
  }

  // Counter for completed requests
  let complete = 0
  const requestCount = 400

  // Track memory usage
  const measurements = []
  let baselineMemory = 0

  // Process a batch of requests
  async function processBatch (start, batchSize) {
    const promises = []
    const end = Math.min(start + batchSize, requestCount)

    for (let i = start; i < end; i++) {
      promises.push(makeRequest(i))
    }

    await Promise.all(promises)
    complete += promises.length

    // Measure memory after each batch
    if (complete % 50 === 0 || complete === end) {
      // Run GC multiple times to get more stable readings
      global.gc()
      await new Promise(resolve => setTimeout(resolve, 50))
      global.gc()

      const memUsage = process.memoryUsage()

      // Establish baseline after first batch
      if (measurements.length === 0) {
        baselineMemory = memUsage.heapUsed
      }

      measurements.push({
        complete,
        heapUsed: memUsage.heapUsed
      })

      console.log(`Completed ${complete}/${requestCount}: Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`)

      // Check memory trend after we have enough data
      if (measurements.length >= 4) {
        const hasLeak = checkMemoryTrend()
        if (hasLeak) {
          return true // Indicates a leak was detected
        }
      }
    }

    return false // No leak detected
  }

  // Main test logic
  async function runTest () {
    const batchSize = 50

    for (let i = 0; i < requestCount; i += batchSize) {
      const leakDetected = await processBatch(i, batchSize)
      if (leakDetected) {
        // If a leak is detected, fail the test
        assert.fail('Memory leak detected: heap usage is consistently increasing at a significant rate')
        return
      }

      // Check if we have sufficient measurements or have done 350 requests
      if (measurements.length >= 7 || complete >= 350) {
        break
      }
    }

    // Final check
    const finalCheckResult = finalMemoryCheck()
    if (finalCheckResult) {
      assert.fail(`Memory leak detected: ${finalCheckResult}`)
    } else {
      ok(true, 'Memory usage has stabilized')
    }
  }

  // Check if memory usage has a concerning trend
  function checkMemoryTrend () {
    // Calculate memory growth between each measurement
    const growthRates = []
    for (let i = 1; i < measurements.length; i++) {
      const prev = measurements[i - 1].heapUsed
      const current = measurements[i].heapUsed
      growthRates.push((current - prev) / prev)
    }

    // Calculate growth from baseline
    const totalGrowthFromBaseline = (measurements[measurements.length - 1].heapUsed - baselineMemory) / baselineMemory

    // Calculate average growth rate
    const avgGrowthRate = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length

    console.log(`Growth from baseline: ${(totalGrowthFromBaseline * 100).toFixed(2)}%`)
    console.log(`Average growth rate: ${(avgGrowthRate * 100).toFixed(2)}%`)
    console.log(`Growth rates: ${growthRates.map(r => (r * 100).toFixed(2) + '%').join(', ')}`)

    // Only flag as leak if all conditions are met:
    // 1. Consistent growth (majority of measurements show growth)
    // 2. Average growth rate is significant (>2%)
    // 3. Total growth from baseline is significant (>20%)

    // Count how many positive growth rates we have
    const positiveGrowthRates = growthRates.filter(rate => rate > 0.01).length

    return (
      positiveGrowthRates >= Math.ceil(growthRates.length * 0.75) && // 75% of measurements show growth >1%
      avgGrowthRate > 0.02 && // Average growth >2%
      totalGrowthFromBaseline > 0.2 // Total growth >20%
    )
  }

  // Final memory check with adjusted requirements
  function finalMemoryCheck () {
    if (measurements.length < 4) return false

    // Calculate growth from baseline to the last measurement
    const totalGrowthFromBaseline = (measurements[measurements.length - 1].heapUsed - baselineMemory) / baselineMemory
    console.log(`Final growth from baseline: ${(totalGrowthFromBaseline * 100).toFixed(2)}%`)

    // Calculate final slope over the last 150 requests
    const lastMeasurements = measurements.slice(-3)
    const finalSlope = (lastMeasurements[2].heapUsed - lastMeasurements[0].heapUsed) /
                      (lastMeasurements[2].complete - lastMeasurements[0].complete)

    console.log(`Final memory slope: ${finalSlope.toFixed(2)} bytes per request`)

    // Only consider it a leak if:
    // 1. Total growth is very significant (>25%)
    if (totalGrowthFromBaseline > 0.25) {
      return `Excessive memory growth of ${(totalGrowthFromBaseline * 100).toFixed(2)}%`
    }

    // 2. Memory is still growing rapidly at the end (>2000 bytes per request)
    if (finalSlope > 2000) {
      return `Memory still growing rapidly at ${finalSlope.toFixed(2)} bytes per request`
    }

    return false
  }

  await runTest()
})
