'use strict'

import { parseArgs, styleText } from 'node:util'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exit } from 'node:process'
import { fork } from 'node:child_process'

/**
 * @typedef {import('../../types/cache-interceptor.d.ts').default.CacheOptions} CacheOptions
 *
 * @typedef {{
 *  opts: CacheOptions,
 *  ignoredTests?: string[],
 *  cacheStore?: 'MemoryCacheStore' | 'SqliteCacheStore'
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
    // Cache type(s) to test
    type: {
      type: 'string',
      multiple: true,
      short: 't'
    },
    // Cache store(s) to test
    store: {
      type: 'string',
      multiple: true,
      short: 's'
    },
    // Only shows errors
    ci: {
      type: 'boolean'
    }
  }
})

/**
 * @type {TestEnvironment}
 */
const BASE_TEST_ENVIRONMENT = {
  opts: { methods: ['GET', 'HEAD'] },
  ignoredTests: [
    // Tests for invalid etags, goes against the spec
    'conditional-etag-forward-unquoted',
    'conditional-etag-strong-generate-unquoted',

    // Responses with no-cache can be reused if they're revalidated (which is
    //  what we're doing)
    'cc-resp-no-cache',
    'cc-resp-no-cache-case-insensitive',

    // We're not caching 304s currently
    '304-etag-update-response-Cache-Control',
    '304-etag-update-response-Content-Foo',
    '304-etag-update-response-Test-Header',
    '304-etag-update-response-X-Content-Foo',
    '304-etag-update-response-X-Test-Header',

    // We just trim whatever's in the decimal place off (i.e. 7200.0 -> 7200)
    'age-parse-float',

    // Broken?
    'head-200-update',
    'head-200-retain',
    'head-410-update',
    'stale-close-must-revalidate',
    'stale-close-no-cache'
  ]
}

/**
 * @type {TestEnvironment[]}
 */
const CACHE_TYPES = [
  {
    opts: { type: 'shared' },
    ignoredTests: [
      'freshness-max-age-s-maxage-private',
      'freshness-max-age-s-maxage-private-multiple'
    ]
  },
  {
    opts: { type: 'private' }
  }
]

/**
 * @type {TestEnvironment[]}
 */
const CACHE_STORES = [
  { opts: {}, cacheStore: 'MemoryCacheStore' }
]

try {
  await import('node:sqlite')
  CACHE_STORES.push({ opts: {}, cacheStore: 'SqliteCacheStore' })
} catch (err) {
  console.warn('Skipping SqliteCacheStore, node:sqlite not present')
}

const PROTOCOL = 'http'
const PORT = 8000

const testEnvironments = filterEnvironments(
  buildTestEnvironments(0, [CACHE_TYPES, CACHE_STORES])
)

console.log(`Testing ${testEnvironments.length} environments\n`)
console.log(`PROTOCOL: ${styleText('gray', PROTOCOL)}`)
console.log('')

/**
 * @type {Array<Promise<[number, Array<Buffer>]>>}
 */
const results = []

// Run all the tests in child processes because the test runner is a bit finicky
for (let i = 0; i < testEnvironments.length; i++) {
  const environment = testEnvironments[i]
  const port = PORT + i

  const promise = new Promise((resolve) => {
    const process = fork(join(import.meta.dirname, 'cache-tests-worker.mjs'), {
      stdio: 'pipe',
      env: {
        TEST_ENVIRONMENT: JSON.stringify(environment),
        BASE_URL: `${PROTOCOL}://localhost:${port}`,
        CI: CLI_OPTIONS.values.ci ? 'true' : undefined,
        npm_config_protocol: PROTOCOL,
        npm_config_port: `${port}`,
        npm_config_pidfile: join(tmpdir(), `http-cache-test-server-${i}.pid`)
      }
    })

    const stdout = []
    process.stdout.on('data', chunk => {
      stdout.push(chunk)
    })

    process.stderr.on('error', chunk => {
      stdout.push(chunk)
    })

    process.on('close', code => {
      resolve([code, stdout])
    })
  })

  results.push(promise)
}

// Status code so we can fail CI jobs if we need
let exitCode = 0

// Print the results of all the results in the order that they exist
for (const [code, stdout] of await Promise.all(results)) {
  exitCode = code

  for (const line of stdout) {
    process.stdout.write(line)
  }

  console.log('')
}

exit(exitCode)

/**
 * @param {number} idx
 * @param  {TestEnvironment[][]} testOptions
 * @returns {TestEnvironment[]}
 */
function buildTestEnvironments (idx, testOptions) {
  let baseEnvironments = testOptions[idx]

  if (idx === 0) {
    // We're at the beginning
    baseEnvironments = baseEnvironments.map(
      environment => joinEnvironments(BASE_TEST_ENVIRONMENT, environment))
  }

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
    const combinedEnvironments = subEnvironments.map(
      subEnvironment => joinEnvironments(baseEnvironment, subEnvironment))

    environments.push(...combinedEnvironments)
  }

  return environments
}

/**
 * @param {TestEnvironment} base
 * @param {TestEnvironment} sub
 * @returns {TestEnvironment}
 */
function joinEnvironments (base, sub) {
  const ignoredTests = base.ignoredTests ?? []
  if (sub.ignoredTests) {
    ignoredTests.push(...sub.ignoredTests)
  }

  return {
    opts: {
      ...base.opts,
      ...sub.opts
    },
    ignoredTests: ignoredTests.length > 0 ? ignoredTests : undefined,
    cacheStore: sub.cacheStore
  }
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

  if (values.store) {
    environments = environments.filter(({ cacheStore }) => {
      if (cacheStore === undefined) {
        return false
      }

      const storeName = cacheStore
      for (const allowedStore of values.store) {
        if (storeName.match(allowedStore)) {
          return true
        }
      }

      return false
    })
  }

  return environments
}
