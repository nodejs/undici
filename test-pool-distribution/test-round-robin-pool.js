const { RoundRobinPool } = require('../index.js')

const pool = new RoundRobinPool('http://localhost:8080', { connections: 5 })

let totalRequests = 0
const backendStats = {}
const duration = 30000 // 30 seconds

console.log('Starting RoundRobinPool test - sending 1 request every 50ms for 30 seconds...')
console.log('Expected behavior: Even distribution across 5 backends')
console.log('This should fix the uneven distribution bug in Pool\n')

// 1 request every 50ms
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
    console.log('✓ EVEN DISTRIBUTION - RoundRobinPool works correctly!')
  } else {
    console.log('⚠ Distribution still uneven (ratio should be < 1.5x)')
  }

  pool.close().then(() => {
    throw new Error('Test completed')
  })
}, duration)
