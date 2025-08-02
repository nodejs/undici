'use strict'

const { MockAgent, setGlobalDispatcher, request } = require('../index')

// Custom console implementation that captures and formats messages
class MockLogger {
  constructor () {
    this.messages = []
  }

  error (...args) {
    const message = args.join(' ')
    this.messages.push(message)

    // Also output with a custom prefix for demo purposes
    console.log(`[CUSTOM LOGGER] ${message}`)
  }

  getMessages () {
    return this.messages
  }

  clear () {
    this.messages = []
  }
}

async function demonstrateBasicTracing () {
  console.log('\n=== Basic Tracing Demo ===')

  const logger = new MockLogger()
  const mockAgent = new MockAgent({
    traceRequests: true,
    console: logger
  })

  setGlobalDispatcher(mockAgent)
  mockAgent.disableNetConnect()

  const mockPool = mockAgent.get('http://localhost:3000')
  mockPool.intercept({ path: '/users', method: 'GET' }).reply(200, [{ id: 1, name: 'John' }])

  // Successful request
  console.log('\n1. Making successful request...')
  await request('http://localhost:3000/users')

  // Failed request
  console.log('\n2. Making failed request...')
  try {
    await request('http://localhost:3000/posts') // No interceptor for this
  } catch (error) {
    // Expected to fail
  }

  console.log(`\nCaptured ${logger.getMessages().length} log messages`)
  await mockAgent.close()
}

async function demonstrateVerboseTracing () {
  console.log('\n=== Verbose Tracing Demo ===')

  const logger = new MockLogger()
  const mockAgent = new MockAgent({
    traceRequests: 'verbose',
    console: logger
  })

  setGlobalDispatcher(mockAgent)
  mockAgent.disableNetConnect()

  const mockPool = mockAgent.get('http://localhost:3000')
  mockPool.intercept({ path: '/api/data', method: 'POST' }).reply(201, { success: true }, {
    headers: { 'content-type': 'application/json' }
  })

  console.log('\n1. Making POST request with body and headers...')
  await request('http://localhost:3000/api/data', {
    method: 'POST',
    body: JSON.stringify({ name: 'test', value: 42 }),
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer token123'
    }
  })

  console.log(`\nCaptured ${logger.getMessages().length} detailed log messages`)
  await mockAgent.close()
}

async function demonstrateTestingScenario () {
  console.log('\n=== Testing Scenario Demo ===')

  // In a test, you might want to capture and assert on log messages
  const logger = new MockLogger()
  const mockAgent = new MockAgent({
    traceRequests: true,
    console: logger
  })

  setGlobalDispatcher(mockAgent)
  mockAgent.disableNetConnect()

  const mockPool = mockAgent.get('http://localhost:3000')
  mockPool.intercept({ path: '/health', method: 'GET' }).reply(200, { status: 'ok' })

  await request('http://localhost:3000/health')

  // In a real test, you would assert on these messages
  const messages = logger.getMessages()
  console.log('\nAssertion examples:')
  console.log(`✓ Should contain incoming request log: ${messages.some(msg => msg.includes('Incoming request:'))}`)
  console.log(`✓ Should contain match confirmation: ${messages.some(msg => msg.includes('✅ MATCHED'))}`)
  console.log(`✓ Total messages captured: ${messages.length}`)

  await mockAgent.close()
}

async function main () {
  console.log('MockAgent Console Tracing Demo')
  console.log('=====================================')

  await demonstrateBasicTracing()
  await demonstrateVerboseTracing()
  await demonstrateTestingScenario()

  console.log('\n=====================================')
  console.log('Demo completed! The console option allows you to:')
  console.log('• Capture tracing output in tests')
  console.log('• Send logs to custom logging systems')
  console.log('• Filter or format tracing messages')
  console.log('• Test tracing behavior itself')
}

main().catch(console.error)
