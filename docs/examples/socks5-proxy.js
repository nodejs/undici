'use strict'

const { Socks5Agent, request, fetch } = require('undici')

// Basic example demonstrating SOCKS5 proxy usage
async function basicSocks5Example () {
  console.log('=== Basic SOCKS5 Proxy Example ===')

  try {
    // Create SOCKS5 proxy wrapper
    const socks5Proxy = new Socks5Agent('socks5://localhost:1080')

    // Make request through SOCKS5 proxy
    const response = await request('http://httpbin.org/ip', {
      dispatcher: socks5Proxy
    })

    console.log('Status:', response.statusCode)
    const body = await response.body.json()
    console.log('Response:', body)

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Example with authentication
async function authenticatedSocks5Example () {
  console.log('\n=== Authenticated SOCKS5 Proxy Example ===')

  try {
    // Using credentials in URL
    const socks5Proxy = new Socks5Agent('socks5://username:password@localhost:1080')

    // Alternative: using options
    // const socks5Proxy = new Socks5Agent('socks5://localhost:1080', {
    //   username: 'username',
    //   password: 'password'
    // })

    const response = await request('http://httpbin.org/headers', {
      dispatcher: socks5Proxy
    })

    console.log('Status:', response.statusCode)
    const body = await response.body.json()
    console.log('Headers seen by server:', body.headers)

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Example with fetch API
async function fetchWithSocks5Example () {
  console.log('\n=== Fetch with SOCKS5 Proxy Example ===')

  try {
    const socks5Proxy = new Socks5Agent('socks5://localhost:1080')

    const response = await fetch('http://httpbin.org/json', {
      dispatcher: socks5Proxy
    })

    console.log('Status:', response.status)
    const data = await response.json()
    console.log('JSON data:', data)

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Example with HTTPS
async function httpsWithSocks5Example () {
  console.log('\n=== HTTPS with SOCKS5 Proxy Example ===')

  try {
    const socks5Proxy = new Socks5Agent('socks5://localhost:1080')

    const response = await request('https://httpbin.org/ip', {
      dispatcher: socks5Proxy
    })

    console.log('Status:', response.statusCode)
    const body = await response.body.json()
    console.log('HTTPS Response:', body)

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Example with connection pooling
async function connectionPoolingExample () {
  console.log('\n=== Connection Pooling Example ===')

  try {
    const socks5Proxy = new Socks5Agent('socks5://localhost:1080', {
      connections: 5,  // Allow up to 5 concurrent connections
      pipelining: 1    // Enable HTTP/1.1 pipelining
    })

    // Make multiple concurrent requests
    const requests = []
    for (let i = 0; i < 3; i++) {
      requests.push(
        request(`http://httpbin.org/delay/${i}`, {
          dispatcher: socks5Proxy
        })
      )
    }

    console.log('Making 3 concurrent requests...')
    const responses = await Promise.all(requests)

    for (let i = 0; i < responses.length; i++) {
      console.log(`Request ${i + 1} status:`, responses[i].statusCode)
      // Consume body to avoid warnings
      await responses[i].body.dump()
    }

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Example with error handling
async function errorHandlingExample () {
  console.log('\n=== Error Handling Example ===')

  try {
    // Intentionally use a non-existent proxy
    const socks5Proxy = new Socks5Agent('socks5://localhost:9999')

    await request('http://httpbin.org/ip', {
      dispatcher: socks5Proxy
    })
  } catch (error) {
    console.log('Caught expected error:', error.message)
    console.log('Error code:', error.code)
  }
}

// Global dispatcher example
async function globalDispatcherExample () {
  console.log('\n=== Global Dispatcher Example ===')

  const { setGlobalDispatcher, getGlobalDispatcher } = require('undici')

  try {
    const socks5Proxy = new Socks5Agent('socks5://localhost:1080')

    // Save original dispatcher
    const originalDispatcher = getGlobalDispatcher()

    // Set SOCKS5 proxy as global dispatcher
    setGlobalDispatcher(socks5Proxy)

    // All requests now go through SOCKS5 proxy automatically
    const response = await request('http://httpbin.org/ip')

    console.log('Status:', response.statusCode)
    const body = await response.body.json()
    console.log('Response through global SOCKS5 proxy:', body)

    // Restore original dispatcher
    setGlobalDispatcher(originalDispatcher)

    await socks5Proxy.close()
  } catch (error) {
    console.error('Error:', error.message)
  }
}

// Run examples
async function runExamples () {
  console.log('SOCKS5 Proxy Examples for Undici')
  console.log('================================')
  console.log('Note: These examples require a SOCKS5 proxy running on localhost:1080')
  console.log('You can use tools like dante-server, shadowsocks, or SSH tunneling.\n')

  await basicSocks5Example()
  await authenticatedSocks5Example()
  await fetchWithSocks5Example()
  await httpsWithSocks5Example()
  await connectionPoolingExample()
  await errorHandlingExample()
  await globalDispatcherExample()

  console.log('\n=== All examples completed ===')
}

// Only run if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error)
}

module.exports = {
  basicSocks5Example,
  authenticatedSocks5Example,
  fetchWithSocks5Example,
  httpsWithSocks5Example,
  connectionPoolingExample,
  errorHandlingExample,
  globalDispatcherExample
}
