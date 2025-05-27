const express = require('express')
const crypto = require('crypto')

// Function to create server instance
function createServer (port) {
  const app = express()

  // Track request counts to selectively delay certain requests
  let requestCount = 0

  // Global control variable to simulate server hanging
  let shouldStall = false

  // Toggle the stall status every 30 seconds
  setInterval(() => {
    shouldStall = !shouldStall
    console.log(`Server hang status changed to: ${shouldStall ? 'hanging' : 'normal'}`)
  }, 30000)

  app.get('/files/:size', (req, res) => {
    const sizeInKB = parseInt(req.params.size, 10)
    const sizeInBytes = sizeInKB * 1024

    requestCount++

    // Set response headers
    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Length', sizeInBytes)

    // Set response timeout for each request to prevent complete connection interruption
    req.socket.setTimeout(300000) // 5 minute timeout

    // Prevent errors caused by client-side connection interruption
    req.on('close', () => {
      console.log(`Request #${requestCount}: Connection closed by client`)
    })

    // Generate random data
    const buffer = crypto.randomBytes(sizeInBytes)

    // Apply slow transfer strategy for all large file requests
    if (sizeInBytes > 100 * 1024) { // Files larger than 100KB
      console.log(`Request #${requestCount}: Applying slow transfer (${sizeInKB}KB)`)

      // Use smaller chunks and more precise control
      const CHUNK_SIZE = 16 * 1024 // 16KB
      let offset = 0
      let chunkCount = 0

      // Progress counter
      const totalChunks = Math.ceil(sizeInBytes / CHUNK_SIZE)

      function sendNextChunk () {
        // Check if need to enter hanging state
        if (shouldStall && chunkCount > 1) {
          console.log(`Request #${requestCount}: Global hang signal detected, pausing data transfer [${chunkCount}/${totalChunks}]`)
          // Pause for a very long time, but don't end the response, keeping the client hanging
          setTimeout(sendNextChunk, 60000) // Check again after 1 minute
          return
        }

        if (offset >= sizeInBytes) {
          console.log(`Request #${requestCount}: Transfer completed`)
          res.end()
          return
        }

        try {
          // Determine current chunk size
          const end = Math.min(offset + CHUNK_SIZE, sizeInBytes)
          const chunk = buffer.slice(offset, end)

          // Use callback to ensure data is written
          res.write(chunk, (err) => {
            if (err) {
              console.error(`Request #${requestCount}: Write error`, err)
              try { res.end() } catch (e) {}
              return
            }

            offset += chunk.length
            chunkCount++

            // Determine delay based on chunk number
            let delay

            // First two chunks sent quickly, subsequent chunks intentionally slowed
            if (chunkCount <= 2) {
              delay = 50 // Send first two chunks quickly
              console.log(`Request #${requestCount}: Sending fast chunk ${chunkCount}/${totalChunks}, size: ${chunk.length / 1024}KB`)
            } else if (chunkCount === 3) {
              // After the third chunk, enter extra long delay to ensure client reader.read() will hang
              delay = 120000 // 2 minute delay
              console.log(`Request #${requestCount}: Entering extra long delay ${delay}ms`)
            } else {
              delay = 10000 // Subsequent chunks also slow
              console.log(`Request #${requestCount}: Sending slow chunk ${chunkCount}/${totalChunks}, delay: ${delay}ms`)
            }

            // Set time to send the next chunk
            setTimeout(sendNextChunk, delay)
          })
        } catch (err) {
          console.error(`Request #${requestCount}: Send error`, err)
          try { res.end() } catch (e) {}
        }
      }

      // Start sending
      sendNextChunk()
    } else {
      // Small files still have some delay to prevent all responses from completing too quickly
      setTimeout(() => {
        res.end(buffer)
      }, Math.random() * 2000) // 0-2000ms random delay
    }
  })

  return app.listen(port, () => {
    console.log(`Server running on port ${port} - http://localhost:${port}/files/:size`)
  })
}

// Start 4 server instances on different ports
const ports = [3000, 3001, 3002, 3003]
const servers = ports.map(port => createServer(port))

// Add overall startup success log
console.log('=================================================')
console.log('✅ All servers started successfully!')
console.log('=================================================')
console.log(`🚀 Started ${ports.length} test server instances:`)
ports.forEach(port => {
  console.log(`   - http://localhost:${port}`)
})
console.log('\n📄 Available endpoints:')
console.log('   - GET /files/:size - Returns random data of specified size (KB)')
console.log('     Example: http://localhost:3000/files/1024 will return 1MB data')
console.log('\n⚙️  Press Ctrl+C to stop all servers')
console.log('=================================================')

// Add graceful shutdown handling
process.on('SIGINT', () => {
  console.log('Shutting down servers...')
  servers.forEach(server => server.close())
  process.exit()
})
