const http = require('node:http')

const port = process.argv[2] || 3000
let requestCount = 0

http.createServer((req, res) => {
  requestCount++
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ port, requestCount }))
  }, 100 + Math.random() * 100) // 100-200ms response time
}).listen(port, () => console.log(`Backend server listening on port ${port}`))

// Log stats every 5 seconds
setInterval(() => {
  console.log(`[Port ${port}] Total requests: ${requestCount}`)
}, 5000)
