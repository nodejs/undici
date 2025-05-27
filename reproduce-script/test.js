// First load the async logger
require('./asyncLogger')

const undici = require('../index.js')

// Use global async logger, fallback to console if it doesn't exist
const logger = global.__asyncLogger || console
logger.info('Test started - Using logger:', global.__asyncLogger ? 'global.__asyncLogger' : 'console')

async function downloadSingleFile (url, index) {
  const startTime = Date.now()
  const timeout = 5000 // Increased to 5 seconds
  logger.info(`[${index}] Starting request to ${url} at ${new Date().toISOString()}`)

  const controller = new AbortController()
  const reqTimer = setTimeout(() => {
    logger.info(`[${index}] Aborting request after 5000ms`)
    controller.abort()
  }, timeout)

  try {
    const response = await undici.fetch(url, {
      signal: controller.signal,
      headers: {},
      bodyTimeout: 500000, // Increased to 500 seconds to ensure no reading timeout interruption
      headersTimeout: 60000 // Increased header timeout
    })

    logger.info(`[${index}] Got response in ${Date.now() - startTime}ms, status: ${response.status}`)

    if (response.status >= 200 && response.status < 300) {
      logger.info(`[${index}] Starting to read body at ${new Date().toISOString()}`)
      const textStartTime = Date.now()

      // Add extra monitoring to detect long-running text() calls
      const textTimeout = setTimeout(() => {
        logger.warn(`[${index}] ⚠️ WARNING: response.text() has been running for 5 seconds without completing!`)
      }, 5000)

      // Additional: Pass request index to response object for use in readAllBytes
      // This is a special handling for undici's internal implementation
      if (response.body && response.body.getReader) {
        const originalGetReader = response.body.getReader.bind(response.body)
        response.body.getReader = function () {
          const reader = originalGetReader()
          // Inject index into reader object for tracking
          reader.__tempIndexIdx = index

          // Additionally record read start time
          reader.__readStartTime = Date.now()

          // Add diagnostic log
          logger.info(`[${index}] Created reader instance, start time: ${new Date(reader.__readStartTime).toISOString()}`)

          return reader
        }
      }

      // Increase timeout monitoring frequency
      const textTimeoutInterval = setInterval(() => {
        const elapsedTime = Date.now() - textStartTime
        logger.warn(`[${index}] ⚠️ WARNING: response.text() has been running for ${elapsedTime / 1000} seconds without completing!`)
      }, 3000)

      // This may get stuck, which is the issue we're trying to reproduce
      try {
        const text = await response.text()
        clearInterval(textTimeoutInterval)
        clearTimeout(textTimeout)

        const textDuration = Date.now() - textStartTime
        logger.info(`[${index}] Completed reading body in ${textDuration}ms, length: ${text.length}`)

        // Record longer response times
        if (textDuration > 2000) {
          logger.warn(`[${index}] ⚠️ Slow text() operation detected: ${textDuration}ms for ${url}`)
        }

        return { success: true, length: text.length, duration: textDuration }
      } catch (textError) {
        clearInterval(textTimeoutInterval)
        clearTimeout(textTimeout)
        logger.error(`[${index}] Text reading error:`, textError)
        throw textError
      }
    } else {
      return { success: false, status: response.status }
    }
  } catch (err) {
    logger.error(`[${index}] Error:`, {
      name: err.name,
      message: err.message,
      cause: err.cause,
      timestamp: new Date().toISOString()
    })
    return { success: false, error: err.message }
  } finally {
    clearTimeout(reqTimer)
  }
}

async function runTest () {
  // Force requests for large files to increase probability of triggering the issue
  const totalRequests = 100 // Reduce number of requests, but each is a large file

  // Simulate 4 different hosts
  const hosts = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003'
  ]

  // Generate requests, all for large files
  const requests = Array.from({ length: totalRequests }, (_, i) => {
    // All requests for large files
    const size = Math.floor(Math.random() * 4000) + 2000 // 2MB-6MB

    const host = hosts[i % hosts.length]
    return `${host}/files/${size}`
  })

  // Use lower concurrency, focusing on fewer large files
  const concurrency = 10 // Reduce concurrency to allow server to process
  const results = []
  let completedRequests = 0

  // Implement more aggressive concurrency model
  const batches = []
  for (let i = 0; i < requests.length; i += concurrency) {
    batches.push(requests.slice(i, i + concurrency))
  }

  // Use concurrency pattern closer to the issue description
  logger.info(`Starting test with ${requests.length} total requests, concurrency: ${concurrency}`)
  logger.info(`Using ${hosts.length} different hosts`)

  // Add functionality to periodically record current status
  const statusInterval = setInterval(() => {
    logger.info(`Current progress: ${completedRequests}/${totalRequests} completed`)
    logMemoryUsage()
  }, 5000)

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const batchStartTime = Date.now()

    logger.info(`Starting batch ${batchIndex + 1}/${batches.length}, size: ${batch.length}`)

    // Start all requests simultaneously
    const batchPromises = batch.map((url, idx) => {
      const requestIndex = batchIndex * concurrency + idx
      return downloadSingleFile(url, requestIndex)
        .then(result => {
          completedRequests++
          if (completedRequests % 10 === 0) {
            logger.info(`Progress: ${completedRequests}/${totalRequests} completed`)
          }
          return result
        })
    })

    // Wait for all requests in this batch to complete
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)

    logger.info(`Completed batch ${batchIndex + 1}/${batches.length} in ${Date.now() - batchStartTime}ms`)
  }

  clearInterval(statusInterval)
  return results
}

// Add memory usage monitoring
function logMemoryUsage () {
  const used = process.memoryUsage()
  logger.info('Memory usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(used.external / 1024 / 1024)} MB`
  })
}

// Record memory usage every 10 seconds
const memoryInterval = setInterval(logMemoryUsage, 10000)

runTest().then((results) => {
  clearInterval(memoryInterval)

  const successes = results.filter(r => r.success).length
  const failures = results.filter(r => !r.success).length

  // Calculate statistics for text() operations
  const textDurations = results
    .filter(r => r.success && r.duration)
    .map(r => r.duration)

  const avgDuration = textDurations.reduce((sum, d) => sum + d, 0) / (textDurations.length || 1)
  const maxDuration = Math.max(...(textDurations.length ? textDurations : [0]))
  const slowResponses = results.filter(r => r.success && r.duration > 2000).length

  console.log('\nTest Summary:')
  console.log(`Total requests: ${results.length}`)
  console.log(`Successful: ${successes}`)
  console.log(`Failed: ${failures}`)
  console.log(`Average text() duration: ${avgDuration.toFixed(2)}ms`)
  console.log(`Maximum text() duration: ${maxDuration}ms`)
  console.log(`Slow responses (>2000ms): ${slowResponses}`)

  logMemoryUsage()
}).catch(console.error)
