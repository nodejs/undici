'use strict'

import { styleText } from 'node:util'
import { exit } from 'node:process'
import { getResults, runTests as runTestSuite } from '../fixtures/cache-tests/test-engine/client/runner.mjs'
import { determineTestResult, testLookup } from '../fixtures/cache-tests/test-engine/lib/results.mjs'
import tests from '../fixtures/cache-tests/tests/index.mjs'
import { Agent, fetch, interceptors, setGlobalDispatcher } from '../../index.js'
import MemoryCacheStore from '../../lib/cache/memory-cache-store.js'

if (!process.env.TEST_ENVIRONMENT) {
  throw new Error('missing TEST_ENVIRONMENT')
}

if (!process.env.BASE_URL) {
  throw new Error('missing BASE_URL')
}

/**
 * @type {import('./cache-tests.mjs').TestEnvironment}
 */
const environment = JSON.parse(process.env.TEST_ENVIRONMENT)
if (environment.cacheStore) {
  environment.opts.store = await makeCacheStore(environment.cacheStore)
}

// Start the test server
await import('../fixtures/cache-tests/test-engine/server/server.mjs')

// Output the testing setup
console.log('TEST ENVIRONMENT')
console.log(`       BASE_URL: ${styleText('gray', process.env.BASE_URL)}`)
if (environment.opts.store) {
  console.log(`          store: ${styleText('gray', environment.opts.store?.constructor.name ?? 'undefined')}`)
}
if (environment.opts.methods) {
  console.log(`        methods: ${styleText('gray', JSON.stringify(environment.opts.methods) ?? 'undefined')}`)
}
if (environment.opts.cacheByDefault) {
  console.log(` cacheByDefault: ${styleText('gray', `${environment.opts.cacheByDefault}`)}`)
}
if (environment.opts.type) {
  console.log(`           type: ${styleText('gray', environment.opts.type)}`)
}
if (environment.ignoredTests) {
  console.log(`  ignored tests: ${styleText('gray', JSON.stringify(environment.ignoredTests))}`)
}

// Setup the client
const client = new Agent().compose(interceptors.cache(environment.opts))
setGlobalDispatcher(client)

// Run the suite
await runTestSuite(tests, fetch, true, process.env.BASE_URL)

let exitCode = 0

// Print the results
const stats = printResults(environment, getResults())
printStats(stats)

exit(exitCode)

/**
 * @param {import('./cache-tests.mjs').TestEnvironment['cacheStore']} type
 * @returns {Promise<import('../../types/cache-interceptor').default.CacheStore>}
 */
async function makeCacheStore (type) {
  const stores = {
    MemoryCacheStore
  }

  try {
    await import('node:sqlite')

    const { default: SqliteCacheStore } = await import('../../lib/cache/sqlite-cache-store.js')
    stores.SqliteCacheStore = SqliteCacheStore
  } catch (err) {
    // Do nothing
  }

  const Store = stores[type]
  if (!Store) {
    throw new TypeError(`unknown cache store: ${type}`)
  }

  return new Store()
}

/**
 * @param {import('./cache-tests.mjs').TestEnvironment} environment
 * @param {any} results
 * @returns {import('./cache-tests.mjs').TestStats}
 */
function printResults (environment, results) {
  /**
   * @type {import('./cache-tests.mjs').TestStats}
   */
  const stats = {
    total: Object.keys(results).length - (environment.ignoredTests?.length || 0),
    skipped: 0,
    passed: 0,
    failed: 0,
    optionalFailed: 0,
    setupFailed: 0,
    testHarnessFailed: 0,
    dependencyFailed: 0,
    retried: 0
  }

  for (const testId in results) {
    if (environment.ignoredTests?.includes(testId)) {
      continue
    }

    const test = testLookup(tests, testId)
    // eslint-disable-next-line no-unused-vars
    const [code, _, icon] = determineTestResult(tests, testId, results, false)

    let status
    let color
    switch (code) {
      case '-':
        status = 'skipped'
        color = 'gray'
        stats.skipped++
        break
      case '\uf058':
        status = 'pass'
        color = 'green'
        stats.passed++
        break
      case '\uf057':
        status = 'failed'
        color = 'red'
        stats.failed++
        exitCode = 1
        break
      case '\uf05a':
        status = 'failed (optional)'
        color = 'yellow'
        stats.optionalFailed++
        break
      case '\uf055':
        status = 'yes'
        color = 'green'
        stats.passed++
        break
      case '\uf056':
        status = 'no'
        color = 'yellow'
        stats.optionalFailed++
        break
      case '\uf059':
        status = 'setup failure'
        color = 'red'
        stats.setupFailed++
        break
      case '\uf06a':
        status = 'test harness failure'
        color = 'red'
        stats.testHarnessFailed++
        break
      case '\uf192':
        status = 'dependency failure'
        color = 'red'
        stats.dependencyFailed++
        break
      case '\uf01e':
        status = 'retry'
        color = 'yellow'
        stats.retried++
        break
      default:
        status = 'unknown'
        color = ['strikethrough', 'white']
        break
    }

    if (process.env.CI && status !== 'failed') {
      continue
    }

    console.log(`${icon} ${styleText(color, `${status} - ${test.name}`)} (${styleText('gray', testId)})`)
    if (results[testId] !== true) {
      const [type, message] = results[testId]
      console.log(`    ${styleText(color, `${type}: ${message}`)}`)
    }
  }

  return stats
}

/**
 * @param {import('./cache-tests.mjs').TestStats} stats
 */
function printStats (stats) {
  const {
    total,
    skipped,
    passed,
    failed,
    optionalFailed,
    setupFailed,
    testHarnessFailed,
    dependencyFailed,
    retried
  } = stats

  console.log(`\n        Total tests: ${total}`)
  console.log(`            ${styleText('gray', 'Skipped')}: ${skipped} (${((skipped / total) * 100).toFixed(1)}%)`)
  console.log(`             ${styleText('green', 'Passed')}: ${passed} (${((passed / total) * 100).toFixed(1)}%)`)
  console.log(`             ${styleText('red', 'Failed')}: ${failed} (${((failed / total) * 100).toFixed(1)}%)`)
  console.log(`  ${styleText('yellow', 'Failed (optional)')}: ${optionalFailed} (${((optionalFailed / total) * 100).toFixed(1)}%)`)
  console.log(`       ${styleText('red', 'Setup failed')}: ${setupFailed} (${((setupFailed / total) * 100).toFixed(1)}%)`)
  console.log(`${styleText('red', 'Test Harness Failed')}: ${testHarnessFailed} (${((testHarnessFailed / total) * 100).toFixed(1)}%)`)
  console.log(`  ${styleText('red', 'Dependency Failed')}: ${dependencyFailed} (${((dependencyFailed / total) * 100).toFixed(1)}%)`)
  console.log(`            ${styleText('yellow', 'Retried')}: ${retried} (${((retried / total) * 100).toFixed(1)}%)`)
}
