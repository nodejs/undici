import { run } from 'node:test'
import Reporters from 'node:test/reporters'
import { finished } from 'node:stream/promises'
import os from 'node:os'
import process from 'node:process'
import { glob } from 'glob'
import githubReporter from '@reporters/github'
import { resolve } from 'node:path'

// Match borp's workaround.
delete process.env.NODE_TEST_CONTEXT

const cwd = process.cwd()
const pattern = 'test/node-test/**/*.js'
const concurrency = os.availableParallelism() - 1 || 1
const timeout = 180000
const hardTimeout = Number(process.env.NODE_TEST_CI_HARD_TIMEOUT_MS || 10 * 60 * 1000)

function isStdioSocket (handle) {
  return handle?.constructor?.name === 'Socket' && [0, 1, 2].includes(handle?._handle?.fd)
}

function describeHandle (handle) {
  const type = handle?.constructor?.name || typeof handle

  if (type === 'Socket') {
    return {
      type,
      fd: handle?._handle?.fd,
      local: handle.localAddress && handle.localPort ? `${handle.localAddress}:${handle.localPort}` : undefined,
      remote: handle.remoteAddress && handle.remotePort ? `${handle.remoteAddress}:${handle.remotePort}` : undefined,
      readable: handle.readable,
      writable: handle.writable,
      destroyed: handle.destroyed
    }
  }

  if (type === 'Server') {
    return {
      type,
      listening: handle.listening,
      address: typeof handle.address === 'function' ? handle.address() : undefined
    }
  }

  if (type === 'Timeout') {
    return {
      type,
      idleTimeout: handle._idleTimeout,
      hasRef: typeof handle.hasRef === 'function' ? handle.hasRef() : undefined
    }
  }

  if (type === 'ChildProcess') {
    return {
      type,
      pid: handle.pid,
      spawnfile: handle.spawnfile,
      exitCode: handle.exitCode,
      signalCode: handle.signalCode,
      killed: handle.killed
    }
  }

  return {
    type,
    keys: Object.keys(handle || {}).slice(0, 12)
  }
}

function dumpDiagnostics (label) {
  const handles = process._getActiveHandles()
    .filter((handle) => !isStdioSocket(handle))
    .map(describeHandle)
  const requests = process._getActiveRequests().map((request) => request?.constructor?.name || typeof request)
  const resources = typeof process.getActiveResourcesInfo === 'function'
    ? process.getActiveResourcesInfo()
    : []

  console.error(`[node-test-ci] ${label}`)
  console.error(`[node-test-ci] active resources: ${JSON.stringify(resources)}`)
  console.error(`[node-test-ci] active requests (${requests.length}): ${JSON.stringify(requests)}`)
  console.error(`[node-test-ci] active handles (${handles.length}): ${JSON.stringify(handles)}`)
}

const watchdog = setTimeout(() => {
  console.error(`[node-test-ci] hard timeout after ${hardTimeout}ms`)
  dumpDiagnostics('before forced failure')
  // eslint-disable-next-line n/no-process-exit
  process.exit(1)
}, hardTimeout)

const childHooksPath = resolve(cwd, 'scripts/node-test-child-hooks.cjs')
const childNodeOptions = `--require=${childHooksPath}`
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS
  ? `${process.env.NODE_OPTIONS} ${childNodeOptions}`
  : childNodeOptions
console.error(`[node-test-ci] NODE_OPTIONS=${process.env.NODE_OPTIONS}`)

const files = await glob(pattern, {
  cwd,
  absolute: true,
  ignore: ['node_modules/**/*']
})

const reporters = [Reporters.spec]
if (process.env.GITHUB_ACTION) {
  reporters.push(githubReporter)
}

const stream = run({
  cwd,
  files,
  concurrency,
  timeout,
  coverage: false
})

stream.on('test:fail', () => {
  process.exitCode = 1
})

for (const Reporter of reporters) {
  const reporter = Reporter.prototype && Object.getOwnPropertyDescriptor(Reporter.prototype, 'constructor')
    ? new Reporter()
    : Reporter
  stream.compose(reporter).pipe(process.stdout)
}

try {
  await finished(stream)
  clearTimeout(watchdog)
  dumpDiagnostics('after stream finished')

  await new Promise((resolve) => setTimeout(resolve, 250))
  dumpDiagnostics('250ms after stream finished')

  // eslint-disable-next-line n/no-process-exit
  process.exit(process.exitCode ?? 0)
} catch (err) {
  clearTimeout(watchdog)
  console.error(err)
  dumpDiagnostics('after runner error')
  // eslint-disable-next-line n/no-process-exit
  process.exit(1)
}
