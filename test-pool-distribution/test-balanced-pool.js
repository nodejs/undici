const { BalancedPool } = require('../index.js')

// BalancedPool requires array of upstreams - different use case
// It's for load balancing across different origins, not multiple
// connections to a single load-balanced endpoint
const pool = new BalancedPool([
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://localhost:3005'
])

let totalRequests = 0
const backendStats = {}
const duration = 30000 // 30 seconds

console.log('Starting BalancedPool test - sending 1 request every 50ms for 30 seconds...')
console.log('Note: BalancedPool connects DIRECTLY to backends (no load balancer)')
console.log('This is a different use case than Pool + load balancer\n')

const interval = setInterval(async () => {
  try {
    const { body } = await pool.request({ path: '/', method: 'GET' })
    const data = JSON.parse(await body.text())
    totalRequests++

    const port = data.port
    backendStats[port] = (backendStats[port] || 0) + 1
  } catch (err) {
    console.error('Request error:', err.message)
  }
}, 50)

// Print stats every 5 seconds
const statsInterval = setInterval(() => {
  console.log('\n--- Current Distribution ---')
  Object.entries(backendStats).sort().forEach(([port, count]) => {
    const percentage = ((count / totalRequests) * 100).toFixed(1)
    const bar = '█'.repeat(Math.floor(count / 5))
    console.log(`Backend ${port}: ${count.toString().padStart(3)} requests (${percentage}%) ${bar}`)
  })
  console.log(`Total: ${totalRequests} requests`)
}, 5000)

setTimeout(() => {
  clearInterval(interval)
  clearInterval(statsInterval)

  console.log('\n=== Final Results ===')
  Object.entries(backendStats).sort().forEach(([port, count]) => {
    const percentage = ((count / totalRequests) * 100).toFixed(1)
    const bar = '█'.repeat(Math.floor(count / 5))
    console.log(`Backend ${port}: ${count.toString().padStart(3)} requests (${percentage}%) ${bar}`)
  })
  console.log(`Total: ${totalRequests} requests`)

  // Check if distribution is even
  const counts = Object.values(backendStats)
  const max = Math.max(...counts)
  const min = Math.min(...counts)
  const ratio = max / min

  console.log(`\nDistribution ratio (max/min): ${ratio.toFixed(2)}x`)
  if (ratio < 1.5) {
    console.log('✓ Distribution is even - BalancedPool works as expected')
  } else {
    console.log('⚠ Distribution still uneven')
  }

  pool.close().then(() => {
    throw new Error('Test completed')
  })
}, duration)
