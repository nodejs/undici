'use strict'

const path = require('node:path')

const intervalMs = Number(process.env.NODE_TEST_CHILD_DIAG_INTERVAL_MS || 60000)
const timeoutMs = Number(process.env.NODE_TEST_CHILD_DIAG_TIMEOUT_MS || 240000)
const start = Date.now()
const files = process.argv.filter((arg) => /test[\\/].*\.js$/.test(arg)).map((arg) => path.relative(process.cwd(), arg))

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

  console.error(`[node-test-child] ${label}`)
  console.error(`[node-test-child] pid=${process.pid} ppid=${process.ppid} uptime_ms=${Date.now() - start} files=${JSON.stringify(files)}`)
  console.error(`[node-test-child] active resources: ${JSON.stringify(resources)}`)
  console.error(`[node-test-child] active requests (${requests.length}): ${JSON.stringify(requests)}`)
  console.error(`[node-test-child] active handles (${handles.length}): ${JSON.stringify(handles)}`)
}

console.error(`[node-test-child] loaded pid=${process.pid} ppid=${process.ppid} files=${JSON.stringify(files)}`)

const interval = setInterval(() => {
  dumpDiagnostics(`heartbeat after ${Date.now() - start}ms`)
}, intervalMs)
interval.unref()

const timeout = setTimeout(() => {
  dumpDiagnostics(`watchdog after ${timeoutMs}ms`)
}, timeoutMs)
timeout.unref()

process.on('beforeExit', () => {
  dumpDiagnostics('beforeExit')
})

process.on('SIGTERM', () => {
  dumpDiagnostics('SIGTERM')
})

process.on('SIGINT', () => {
  dumpDiagnostics('SIGINT')
})
