// Copyright 2018-2025 the Deno authors. MIT license.

import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { debuglog } from 'node:util'
import {
  sanitizeUnpairedSurrogates,
  createDeferredPromise
} from './runner/utils.mjs'
import * as jsondiffpatch from 'jsondiffpatch'

const WPT_DIR = join(import.meta.dirname, 'wpt')
const EXPECTATION_PATH = join(import.meta.dirname, 'expectation.json')
const CA_CERT_PATH = join(import.meta.dirname, 'runner/certs/cacert.pem')

const log = debuglog('UNDICI_WPT')

async function runWithTestUtil (testFunction) {
  const { promise, resolve, reject } = createDeferredPromise()

  console.log('Starting WPT server...')
  const proc = spawn('python3', ['wpt', 'serve', '--config', '../runner/config.json'], {
    cwd: WPT_DIR,
    stdio: 'inherit'
  })

  proc.once('exit', () => resolve())
  proc.once('error', (err) => reject(err))

  const serverUrl = 'http://web-platform.test:8000/'

  // Wait for server to be ready
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 500))

    try {
      const req = await fetch(serverUrl) // eslint-disable-line no-restricted-globals
      await req.body?.cancel()
      if (req.status === 200) {
        break
      }
    } catch (err) {
      // Server not ready yet
    }
  }

  console.log(`✅ WPT server started at ${serverUrl}`)

  let results

  try {
    results = await testFunction()
  } finally {
    console.log('Killing WPT server')

    if (!proc.killed) {
      proc.kill('SIGINT')
    }
  }

  await promise
  return results
}

function runSingleTest (url, options, expectation, timeout = 10000) {
  const startTime = Date.now()
  const { promise, resolve, reject } = createDeferredPromise()

  const proc = spawn('node', [
    '--expose-gc',
    '--no-warnings',
    join(import.meta.dirname, 'runner/test-runner.mjs'),
    url.toString()
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NO_COLOR: '1',
      NODE_EXTRA_CA_CERTS: CA_CERT_PATH
    }
  })

  const cases = []
  let harnessStatus = null
  let stdoutOutput = ''
  let stderrOutput = ''
  let error

  const timer = setTimeout(() => {
    if (!proc.killed) {
      proc.kill('SIGINT')
    }
  }, timeout)

  proc.stdout.pipe(process.stdout)
  proc.stderr.pipe(process.stderr)

  proc.stdout.setEncoding('utf-8')
  proc.stdout.on('data', (chunk) => {
    stdoutOutput += chunk

    let delimiterIndex
    while ((delimiterIndex = stdoutOutput.indexOf('#$#$#')) !== -1) {
      const endIndex = stdoutOutput.indexOf('\n', delimiterIndex)
      if (endIndex !== -1) {
        const message = stdoutOutput.slice(delimiterIndex + 5, endIndex)
        try {
          const { tests, harnessStatus: _harnessStatus } = JSON.parse(message)
          harnessStatus = _harnessStatus
          cases.push(...tests)
        } catch (e) {
          console.error('Failed to parse:', message)
        }
        stdoutOutput = stdoutOutput.slice(endIndex + 1)
      } else {
        break // Wait for more data
      }
    }
  })

  proc.stderr.setEncoding('utf-8')
  proc.stderr.on('data', (chunk) => {
    stderrOutput += chunk

    let delimiterIndex
    while ((delimiterIndex = stderrOutput.indexOf('!#!#!#')) !== -1) {
      const endIndex = stderrOutput.indexOf('\n', delimiterIndex)
      if (endIndex !== -1) {
        const message = stderrOutput.slice(delimiterIndex + 6, endIndex)
        ;({ error } = JSON.parse(message))
        stderrOutput = stderrOutput.slice(endIndex + 1)
      } else {
        break // Wait for more data
      }
    }
  })

  proc.once('exit', () => {
    clearTimeout(timer)
    const duration = Date.now() - startTime

    resolve({
      status: harnessStatus?.status ?? 1,
      harnessStatus,
      duration,
      cases,
      error
    })
  })

  proc.once('error', (err) => reject(err))

  return promise
}

function getExpectation () {
  return JSON.parse(readFileSync(EXPECTATION_PATH, 'utf8'))
}

function updateExpectations (results) {
  const expectations = getExpectation()

  for (const { test, result } of results) {
    const pathSegments = test.path.slice(1).split('/')
    const filename = pathSegments.pop()

    // Navigate to the correct nested object
    let current = expectations
    for (const segment of pathSegments) {
      current[segment] ??= {}
      current = current[segment]
    }

    // Set the expectation based on test result
    const currentFilename = current[filename]

    current[filename] = {
      success: typeof currentFilename?.success === 'string'
        ? currentFilename.success
        : result.status === 0, // If test file itself did not error
      cases: result.cases.map((c) => {
        const currentCase = current[filename]?.cases.find((cc) => cc.name === c.name)

        if (currentCase?.flaky) {
          return {
            name: c.name,
            flaky: true
          }
        }

        return {
          name: c.name,
          success: c.status === 0,
          message: c.message ?? undefined
        }
      })
    }
  }

  writeFileSync(EXPECTATION_PATH, JSON.stringify(expectations, null, 2) + '\n')
  console.log(`✅ Updated expectations file: ${EXPECTATION_PATH}`)
}

function getManifest () {
  const manifestPath = join(WPT_DIR, 'MANIFEST.json')
  if (!existsSync(manifestPath)) {
    throw new Error('MANIFEST.json not found. Run setup first.')
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

function discoverTestsToRun (filter, expectation) {
  const manifest = getManifest()
  const tests = []

  function walkManifest (folder, parentExpectation, prefix) {
    for (const [key, entry] of Object.entries(folder)) {
      if (Array.isArray(entry)) {
        // Test file
        for (const [path, options] of entry.slice(1)) {
          if (!key.endsWith('.html') && !key.endsWith('.js')) continue

          const testPath = path || `${prefix}/${key}`
          const url = new URL(testPath, 'http://web-platform.test:8000')

          if (url.pathname.includes('.worker.') ||
              url.pathname.includes('serviceworker') ||
              url.pathname.includes('sharedworker') ||
              url.pathname.includes('shadowrealm')) {
            continue
          }

          const finalPath = url.pathname + url.search
          if (!filter.some((filter) => finalPath.startsWith(filter) || finalPath.slice(1).startsWith(filter))) {
            continue
          }

          const pathSegments = finalPath.slice(1).split('/')

          const filename = pathSegments[pathSegments.length - 1]
          const testExpectation = parentExpectation?.[filename]

          tests.push({
            path: finalPath,
            url,
            options: options || { script_metadata: [] },
            expectation: testExpectation
          })
        }
      } else {
        const folderExpectation =
          Array.isArray(parentExpectation) || typeof parentExpectation === 'boolean'
            ? parentExpectation
            : parentExpectation?.[key]

        walkManifest(entry, folderExpectation, `${prefix}/${key}`)
      }
    }
  }

  if (manifest.items?.testharness) {
    walkManifest(manifest.items.testharness, expectation, '')
  }

  return tests
}

function generateWPTReport (results, startTime, endTime) {
  const reportResults = []

  for (const { test, result } of results) {
    const status = result.status !== 0
      ? 'CRASH'
      : result.harnessStatus?.status === 0
        ? 'OK'
        : 'ERROR'

    const message = result.harnessStatus?.message ?? result.error?.message ?? null

    const reportResult = {
      test: test.path,
      subtests: result.cases.map((c) => {
        let expected
        if (c.status !== 0) {
          const { success, cases } = test.expectation ?? {}
          if (success === false) { // If the test failed to load
            expected = 'FAIL'
          } else if (Array.isArray(cases)) {
            const theCase = cases.find((aCase) => aCase.name === c.name)
            expected = theCase && !theCase.success ? 'FAIL' : 'PASS'
          }
        }

        return {
          name: sanitizeUnpairedSurrogates(c.name),
          status: c.status === 0 ? 'PASS' : 'FAIL',
          message: c.message ? sanitizeUnpairedSurrogates(c.message) : null,
          expected,
          known_intermittent: []
        }
      }),
      status,
      message: message ? sanitizeUnpairedSurrogates(message) : null,
      duration: result.duration,
      expected: status === 'OK' ? undefined : 'OK',
      known_intermittent: []
    }

    reportResults.push(reportResult)
  }

  return {
    time_start: startTime,
    time_end: endTime,
    results: reportResults
  }
}

async function setup () {
  console.log('Setting up WPT environment...')

  // Check Python
  const pythonCheck = spawn('python3', ['--version'], { stdio: 'pipe' })
  pythonCheck.stdout.setEncoding('ascii')
  const pythonVersion = await new Promise((resolve, reject) => {
    pythonCheck.stdout.on('data', (c) => {
      const versionRegex = /^Python (?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)/.exec(c.trim())

      if (versionRegex !== null) {
        const { major, minor, patch } = versionRegex.groups
        resolve({ major: Number(major), minor: Number(minor), patch: Number(patch) })
        clearTimeout(timeout)
      }
    })

    const timeout = setTimeout(reject, 30_000, 'Took too long to determine Python version')
  })

  if (pythonVersion.major !== 3) {
    throw new Error('Python 3 is required')
  }

  // Check if manifest exists
  const manifestPath = join(WPT_DIR, 'MANIFEST.json')
  if (!existsSync(manifestPath)) {
    console.log('Updating WPT manifest...')
    const manifestProc = spawn('python3', ['wpt', 'manifest'], {
      cwd: WPT_DIR,
      stdio: 'inherit'
    })
    const manifestOk = await new Promise(resolve => {
      manifestProc.on('exit', code => resolve(code === 0))
      manifestProc.on('error', () => resolve(false))
    })

    if (!manifestOk) {
      throw new Error('Failed to update manifest')
    }
  } else {
    console.log('Using existing WPT manifest')
  }

  // Configure hosts file
  const hostsPath = process.platform === 'win32'
    ? `${process.env.SystemRoot}\\System32\\drivers\\etc\\hosts`
    : '/etc/hosts'

  const hostsContent = existsSync(hostsPath) ? readFileSync(hostsPath, 'utf8') : ''
  const etcHostsConfigured = hostsContent.includes('web-platform.test')

  async function setupHostsFile () {
    const makeHostsProc = spawn('python3', ['wpt', 'make-hosts-file'], {
      cwd: WPT_DIR,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    makeHostsProc.stdout.setEncoding('utf-8')
    makeHostsProc.stdout.on('data', (data) => stdout += data) // eslint-disable-line no-return-assign

    const success = await new Promise(resolve => {
      makeHostsProc.on('exit', code => resolve(code === 0))
    })

    if (success) {
      try {
        const entries = '\n\n# Configured for Web Platform Tests (Node.js)\n' + stdout
        writeFileSync(hostsPath, entries)
        console.log(`Updated ${hostsPath}`)
      } catch (err) {
        console.error(`Failed to write to ${hostsPath}. Please run with sudo or configure manually.`)
        throw err
      }
    } else {
      throw new Error('Failed to generate hosts entries')
    }
  }

  if (etcHostsConfigured) {
    console.log(hostsPath + ' is already configured.')
  } else if (!process.env.CI) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    })

    /** @type {Promise<string>} */
    const answer = await new Promise((resolve) => {
      rl.question(
        `The WPT require certain entries to be present in your ${hostsPath} file. Should these be configured automatically? (y/n): `,
        resolve
      )
    }).finally(() => rl.close()).then((a) => a.trim().toLowerCase())

    let hostsModified = false
    if (answer === 'y' || answer === 'yes') {
      try {
        await setupHostsFile()
        hostsModified = true
      } catch (err) {
        console.error('❌ \x1B[31mAutomatic configuration failed.\x1B[0m')
      }
    }
    if (!hostsModified) {
      console.log('Please configure hosts file manually:')
      console.log(`cd ${WPT_DIR}`)
      if (process.platform === 'win32') {
        console.log('python wpt make-hosts-file | Out-File $env:SystemRoot\\System32\\drivers\\etc\\hosts -Encoding ascii -Append')
      } else {
        console.log('python3 wpt make-hosts-file | sudo tee -a /etc/hosts')
      }

      console.log('❌ \x1B[31mSetup incomplete.\x1B[0m')
      process.exit(1) // eslint-disable-line n/no-process-exit
    }
  }

  console.log('✅ Setup complete!')
}

async function run (filters = []) {
  const startTime = Date.now()
  const expectation = getExpectation()
  const tests = discoverTestsToRun(filters, expectation)

  console.log(`Going to run ${tests.length} test files`)

  const results = await runWithTestUtil(async () => {
    const testResults = []

    for (const test of tests) {
      console.log(`${'='.repeat(40)}\n${test.path}\n`)

      const timeout = test.options.timeout === 'long' ? 60_000 : 10_000
      const result = await runSingleTest(test.url, test.options, test.expectation, timeout)

      testResults.push({ test, result })

      console.log(`${test.path}: ${result.cases.length} tests ran in ${result.duration}ms:`)

      if (result.cases.length === 0) {
        console.log(`\t??. ❌ ${result.error?.message ?? 'N/A'}`)
      }

      for (const c of result.cases) {
        console.log(`\t${c.index + 1}. "${c.name}": ${c.status === 0 ? '✅ PASS' : '❌ FAIL'}`)

        if (c.status !== 0 && (c.message || c.stack)) {
          log(`${c.message}:\n${c.stack.split('\n').slice(1).join('\n')}`)
        }
      }
    }

    return testResults
  })

  const endTime = Date.now()
  console.log(`\nCompleted in ${endTime - startTime}ms`)

  // Calculate summary
  const totalTests = results.length
  const { pass, fail } = results.reduce((curr, { result }) => {
    for (const c of result.cases) {
      if (c.status !== 0) {
        curr.fail++
      } else {
        curr.pass++
      }
    }

    return curr
  }, { pass: 0, fail: 0 })

  console.log('\n' + '='.repeat(50))
  console.log('TEST SUMMARY')
  console.log('='.repeat(50))
  console.log(`Total Test Files: ${totalTests}`)
  console.log(`✅ Passing: ${pass}`)
  console.log(`❌ Failing: ${fail}`)
  console.log('='.repeat(50))

  if (process.env.WPT_REPORT) {
    const report = generateWPTReport(results, startTime, endTime)
    writeFileSync(process.env.WPT_REPORT, JSON.stringify(report))
  } else {
    const oldExpectations = getExpectation()
    updateExpectations(results)

    const jsondiff = jsondiffpatch.create({
      propertyFilter: (name) => {
        return name === 'success'
      }
    })

    const diff = jsondiff.diff(oldExpectations, getExpectation())
    process.exitCode = diff === undefined ? 0 : 1

    if (diff !== undefined) {
      console.dir(diff, { depth: Infinity })
    }
  }
}

// CLI
const command = process.argv[2]
const filters = process.argv.slice(3)

switch (command) {
  case 'setup':
    await setup()
    break
  case 'run':
    await run(filters)
    break
  default:
    console.log(`
WPT Test Runner for Node.js

Commands:
  setup                    Configure environment
  run [filter...]          Run tests
`)
    break
}
