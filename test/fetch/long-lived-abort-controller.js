'use strict'

const { fork } = require('node:child_process')
const { resolve: pathResolve } = require('node:path')
const { test } = require('node:test')
const { fetch } = require('../../')
const { strictEqual, fail } = require('node:assert')

const isNode18 = process.version.startsWith('v18')

test('long-lived-abort-controller', { skip: isNode18 }, async (t) => {
  // Spawn a server in a new process to avoid effects from the blocking event loop
  const {
    serverProcess,
    address
  } = await new Promise((resolve, reject) => {
    const childProcess = fork(
      pathResolve(__dirname, '../utils/hello-world-server.js'),
      [],
      { windowsHide: true }
    )

    childProcess.on('message', (address) => {
      resolve({
        serverProcess: childProcess,
        address
      })
    })
    childProcess.on('error', err => {
      reject(err)
    })
  })

  t.after(() => {
    serverProcess.kill('SIGKILL')
  })

  let emittedWarning = null
  function onWarning (value) {
    emittedWarning = value
  }
  process.on('warning', onWarning)
  t.after(() => {
    process.off('warning', onWarning)
  })

  const controller = new AbortController()

  // The maxListener is set to 1500 in request.js.
  // we set it to 2000 to make sure that we are not leaking event listeners.
  // Unfortunately we are relying on GC and implementation details here.
  for (let i = 0; i < 2000; i++) {
    // make request
    const res = await fetch(address, {
      signal: controller.signal
    })

    // drain body
    await res.text()
  }

  if (emittedWarning !== null) {
    fail(emittedWarning)
  } else {
    strictEqual(emittedWarning, null)
  }
})
