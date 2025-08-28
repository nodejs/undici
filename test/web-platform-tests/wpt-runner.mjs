import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'
import {
  setupHostsFile
} from './runner/utils.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WPT_DIR = join(__dirname, 'wpt')
const EXPECTATION_PATH = join(__dirname, 'expectation.json')

class TestFilter {
  constructor (filter) {
    this.filter = filter
  }

  matches (path) {
    if (!this.filter || this.filter.length === 0) {
      return true
    }
    for (const filter of this.filter) {
      if (filter.startsWith('/')) {
        if (path.startsWith(filter)) {
          return true
        }
      } else {
        if (path.substring(1).startsWith(filter)) {
          return true
        }
      }
    }
    return false
  }
}

async function runWithTestUtil (testFunction) {
  console.log('Starting WPT server...')
  const proc = spawn('python3', ['wpt', 'serve', '--config', '../runner/config.json'], {
    cwd: WPT_DIR,
    stdio: 'inherit'
  })

  const serverUrl = 'http://web-platform.test:8000/'

  // Wait for server to be ready
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 1000))

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

  try {
    return await testFunction()
  } finally {
    console.log('Killing WPT server')
    proc.kill('SIGINT')
    await new Promise(resolve => proc.on('exit', resolve))
  }
}

async function runSingleTest (url, options, expectation, timeout = 10000) {
  const startTime = Date.now()

  return new Promise((resolve) => {
    const proc = spawn('node', [
      join(__dirname, 'runner/test-runner.mjs'),
      url.toString()
    ], {
      stdio: ['ignore', 'inherit', 'inherit'],
      env: {
        ...process.env,
        NO_COLOR: '1'
      }
    })

    const cases = []
    const harnessStatus = null

    const timer = setTimeout(() => {
      proc.kill('SIGINT')
    }, timeout)

    proc.on('exit', (code) => {
      clearTimeout(timer)
      const duration = Date.now() - startTime

      resolve({
        status: code,
        harnessStatus,
        duration,
        cases,
        stderr: proc.stderr,
        stdout: proc.stdout
      })
    })
  })
}

function getExpectation () {
  if (!existsSync(EXPECTATION_PATH)) {
    return {}
  }
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
      if (!current[segment]) {
        current[segment] = {}
      }
      current = current[segment]
    }
    
    // Set the expectation based on test result
    current[filename] = result.status === 0
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
              url.pathname.includes('request-upload') ||
              url.pathname.includes('serviceworker') ||
              url.pathname.includes('sharedworker') ||
              url.pathname.includes('shadowrealm')) {
            continue
          }

          const finalPath = url.pathname + url.search
          if (!filter.matches(finalPath)) {
            continue
          }

          const pathSegments = finalPath.slice(1).split('/')
          let current = parentExpectation

          for (let i = 0; i < pathSegments.length - 1; i++) {
            current = current?.[pathSegments[i]]
          }

          const filename = pathSegments[pathSegments.length - 1]
          const testExpectation = current?.[filename] ?? true

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

        // Walk manifest even if no expectation is set (default to allow)
        walkManifest(entry, folderExpectation, `${prefix}/${key}`)
      }
    }
  }

  if (manifest.items?.testharness) {
    walkManifest(manifest.items.testharness, expectation, '')
  }

  return tests
}

async function setup () {
  console.log('Setting up WPT environment...')

  // Check Python
  const pythonCheck = spawn('python3', ['--version'], { stdio: 'pipe' })
  const pythonOk = await new Promise(resolve => {
    pythonCheck.on('close', code => resolve(code === 0))
  })

  if (!pythonOk) {
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

  if (etcHostsConfigured) {
    console.log(hostsPath + ' is already configured.')
  } else if (process.env.CI) {
    await setupHostsFile()
  } else {
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
    }).finally(() => rl.close())

    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      await setupHostsFile()
    } else {
      console.log('Please configure hosts file manually:')
      console.log(`cd ${WPT_DIR}`)
      if (process.platform === 'win32') {
        console.log('python wpt make-hosts-file | Out-File $env:SystemRoot\\System32\\drivers\\etc\\hosts -Encoding ascii -Append')
      } else {
        console.log('python3 wpt make-hosts-file | sudo tee -a /etc/hosts')
      }
    }
  }

  console.log('✅ Setup complete!')
}

async function run (filters = []) {
  const startTime = Date.now()
  const expectation = getExpectation()
  const filter = new TestFilter(filters)
  const tests = discoverTestsToRun(filter, expectation)

  console.log(`Going to run ${tests.length} test files`)

  const results = await runWithTestUtil(async () => {
    const testResults = []

    for (const test of tests) {
      console.log(`${'='.repeat(40)}\n${test.path}\n`)

      const timeout = test.options.timeout === 'long' ? 60_000 : 10_000
      const result = await runSingleTest(test.url, test.options, test.expectation, timeout)
      testResults.push({ test, result })

      console.log(`Result: ${result.status === 0 ? '✅ PASS' : '❌ FAIL'} (${result.duration}ms)`)
    }

    return testResults
  })

  const endTime = Date.now()
  console.log(`\nCompleted in ${endTime - startTime}ms`)
  
  // Calculate summary
  const totalTests = results.length
  const passingTests = results.filter(({ result }) => result.status === 0).length
  const failingTests = totalTests - passingTests
  
  console.log('\n' + '='.repeat(50))
  console.log('TEST SUMMARY')
  console.log('='.repeat(50))
  console.log(`Total tests: ${totalTests}`)
  console.log(`✅ Passing: ${passingTests}`)
  console.log(`❌ Failing: ${failingTests}`)
  console.log('='.repeat(50))

  process.exit(0)
}

async function updateExpectationsCommand (folders = []) {
  const startTime = Date.now()
  const expectation = getExpectation()
  
  // Parse comma-separated folders
  const filters = folders.length > 0 ? folders.join(',').split(',') : []
  const filter = new TestFilter(filters)
  const tests = discoverTestsToRun(filter, expectation)
  
  if (tests.length === 0) {
    console.log('No tests found to run')
    return
  }
  
  console.log(`Going to run ${tests.length} test files and update expectations`)
  
  const results = await runWithTestUtil(async () => {
    const testResults = []
    
    for (const test of tests) {
      console.log(`${'='.repeat(40)}\n${test.path}\n`)
      
      const timeout = test.options.timeout === 'long' ? 60_000 : 10_000
      const result = await runSingleTest(test.url, test.options, test.expectation, timeout)
      testResults.push({ test, result })
      
      console.log(`Result: ${result.status === 0 ? '✅ PASS' : '❌ FAIL'} (${result.duration}ms)`)
    }
    
    return testResults
  })
  
  const endTime = Date.now()
  console.log(`\nCompleted in ${endTime - startTime}ms`)
  
  // Calculate and display summary
  const totalTests = results.length
  const passingTests = results.filter(({ result }) => result.status === 0).length
  const failingTests = totalTests - passingTests
  
  console.log('\n' + '='.repeat(50))
  console.log('TEST SUMMARY')
  console.log('='.repeat(50))
  console.log(`Total tests: ${totalTests}`)
  console.log(`✅ Passing: ${passingTests}`)
  console.log(`❌ Failing: ${failingTests}`)
  console.log('='.repeat(50))
  
  // Update expectations file
  updateExpectations(results)
}

// CLI
const command = process.argv[2]
const filters = process.argv.slice(3)

switch (command) {
  case 'setup':
    setup().catch(console.error)
    break
  case 'run':
    run(filters).catch(console.error)
    break
  case 'update-expectations':
    updateExpectationsCommand(filters).catch(console.error)
    break
  default:
    console.log(`
WPT Test Runner for Node.js

Commands:
  setup                    Configure environment
  run [filter...]          Run tests
  update-expectations      Run tests and update expectations.json
                          [folder1,folder2,...]
`)
    break
}
