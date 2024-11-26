'use strict'

import { Worker } from 'node:worker_threads'
import { parseArgs, styleText } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { once } from 'node:events'
import { Agent, interceptors, setGlobalDispatcher, fetch } from '../../index.js'
import MemoryCacheStore from '../../lib/cache/memory-cache-store.js'
import {
  getResults,
  runTests as runTestSuite
} from '../fixtures/cache-tests/test-engine/client/runner.mjs'
import tests from '../fixtures/cache-tests/tests/index.mjs'
import { testResults, testUUIDs } from '../fixtures/cache-tests/test-engine/client/test.mjs'
import { determineTestResult, testLookup } from '../fixtures/cache-tests/test-engine/lib/results.mjs'

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheOptions} CacheOptions
 *
 * @typedef {{
 *  opts: CacheOptions,
 *  ignoredTests?: string[],
 * }} TestEnvironment
 *
 * @typedef {{
 *  total: number,
 *  skipped: number,
 *  passed: number,
 *  failed: number,
 *  optionalFailed: number,
 *  setupFailed: number,
 *  testHarnessFailed: number,
 *  dependencyFailed: number,
 *  retried: number
 * }} TestStats
 */

const CLI_OPTIONS = parseArgs({
  options: {
    type: {
      type: 'string',
      multiple: true,
      short: 't'
    }
  }
})

/**
 * @type {TestEnvironment[]}
 */
const CACHE_TYPES = [
  {
    opts: { type: 'shared', methods: ['GET', 'HEAD'] },
    ignoredTests: [
      'freshness-max-age-s-maxage-private',
      'freshness-max-age-s-maxage-private-multiple'
    ]
  },
  {
    opts: { type: 'private', methods: ['GET', 'HEAD'] }
  }
]

/**
 * @type {TestEnvironment[]}
 */
const CACHE_STORES = [
  { opts: { store: new MemoryCacheStore() } }
]

const PROTOCOL = 'http'
const PORT = 8000
const BASE_URL = `${PROTOCOL}://localhost:${PORT}`
const PIDFILE = join(tmpdir(), 'http-cache-test-server.pid')

console.log(`PROTOCOL: ${styleText('gray', PROTOCOL)}`)
console.log(`    PORT: ${styleText('gray', `${PORT}`)}`)
console.log(`BASE_URL: ${styleText('gray', BASE_URL)}`)
console.log(` PIDFILE: ${styleText('gray', PIDFILE)}`)
console.log('')

const testEnvironments = filterEnvironments(
  buildTestEnvironments(0, [CACHE_TYPES, CACHE_STORES])
)

console.log(`Testing ${testEnvironments.length} environments`)

for (const environment of testEnvironments) {
  console.log('TEST ENVIRONMENT')
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

  try {
    await runTests(environment)
  } catch (err) {
    console.error(err)
  }

  const stats = printResults(environment, getResults())
  printStats(stats)

  // Cleanup state
  for (const key of Object.keys(testUUIDs)) {
    delete testUUIDs[key]
  }
  for (const key of Object.keys(testResults)) {
    delete testResults[key]
  }

  console.log('')
}

/**
 * @param {number} idx
 * @param  {TestEnvironment[][]} testOptions
 * @returns {TestEnvironment[]}
 */
function buildTestEnvironments (idx, testOptions) {
  const baseEnvironments = testOptions[idx]

  if (idx + 1 >= testOptions.length) {
    // We're at the end, nothing more to make a matrix out of
    return baseEnvironments
  }

  /**
   * @type {TestEnvironment[]}
   */
  const environments = []

  // Get all of the environments below us
  const subEnvironments = buildTestEnvironments(idx + 1, testOptions)

  for (const baseEnvironment of baseEnvironments) {
    const combinedEnvironments = subEnvironments.map(subEnvironment => {
      const ignoredTests = baseEnvironment.ignoredTests ?? []
      if (subEnvironment.ignoredTests) {
        ignoredTests.push(...subEnvironment.ignoredTests)
      }

      return {
        opts: {
          ...baseEnvironment.opts,
          ...subEnvironment.opts
        },
        ignoredTests: ignoredTests.length > 0 ? ignoredTests : undefined
      }
    })

    environments.push(...combinedEnvironments)
  }

  return environments
}

/**
 * @param {TestEnvironment[]} environments
 * @returns {TestEnvironment[]}
 */
function filterEnvironments (environments) {
  const { values } = CLI_OPTIONS

  if (values.type) {
    environments = environments.filter(env =>
      env.opts.type === undefined ||
      values.type?.includes(env.opts.type)
    )
  }

  return environments
}

/**
 * @param {TestEnvironment} environment
 */
async function runTests (environment) {
  // Start the test server. We use a worker here since the suite doesn't expose it
  const worker = new Worker(join(import.meta.dirname, 'cache-tests-worker.mjs'), {
    env: {
      npm_config_protocol: PROTOCOL,
      npm_config_port: `${PORT}`,
      npm_config_pidfile: PIDFILE
    }
  })

  try {
    await once(worker, 'message', { signal: AbortSignal.timeout(5000) })

    const client = new Agent().compose(interceptors.cache(environment.opts))
    setGlobalDispatcher(client)

    // Run the tests
    await runTestSuite(tests, fetch, true, BASE_URL)
  } finally {
    await worker.terminate()
  }
}

/**
 * @param {TestEnvironment} environment
 * @param {any} results
 * @returns {TestStats}
 */
function printResults (environment, results) {
  /**
   * @type {TestStats}
   */
  const stats = {
    // TODO this won't always be this
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
        color = 'red'
        stats.failed++
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

    console.log(`${icon} ${styleText(color, `${status} - ${test.name}`)} (${styleText('gray', testId)})`)

    if (results[testId] !== true) {
      const [type, message] = results[testId]
      console.log(`    ${styleText(color, `${type}: ${message}`)}`)
    }
  }

  return stats
}

/**
 * @param {TestStats} stats
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
