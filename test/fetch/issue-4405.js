'use strict'

const { Worker, isMainThread, workerData } = require('node:worker_threads')

if (isMainThread) {
  const { test } = require('node:test')
  const { tspl } = require('@matteo.collina/tspl')

  // https://github.com/nodejs/undici/issues/4405
  // This test reproduces a bug where aborting a request to an unresponsive host
  // prevents the Node.js process from exiting cleanly due to internal timers/handles
  // remaining referenced in the event loop.
  test('process exits after aborting request to unresponsive host', async (t) => {
    const { ok } = tspl(t, { plan: 1 })

    // Use a non-routable IP address to simulate an unresponsive host
    // 1.2.4.5 is in the range 1.0.0.0/8 which should not have a running server
    const url = 'http://1.2.4.5:6789/'

    const worker = new Worker(__filename, {
      workerData: { url }
    })

    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      // Set a reasonable timeout - the process should exit within a few seconds
      // If it takes longer than 12 seconds, it indicates the bug is present
      const timeout = setTimeout(() => {
        worker.terminate()
        const elapsedTime = Date.now() - startTime
        reject(new Error(`Worker did not exit within ${elapsedTime}ms - process was kept alive by internal handles. This indicates the bug is present.`))
      }, 12000)

      worker.on('exit', (code) => {
        clearTimeout(timeout)

        const elapsedTime = Date.now() - startTime
        console.log(`Worker exited after ${elapsedTime}ms with code ${code}`)

        // EXPECTED BEHAVIOR: Process should exit within connection timeout (10s) after abort
        // PREVIOUS BEHAVIOR (bug): Process would hang indefinitely due to internal timers
        // The fix ensures cleanup happens when connection timeout expires
        const timeoutOk = elapsedTime < 12000 // Should complete within connection timeout + margin
        ok(timeoutOk, `Process exited in ${elapsedTime}ms (should be < 12000ms, was hanging indefinitely before fix)`)
        resolve()
      })

      worker.on('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    })
  })
} else {
  // Worker thread code
  const { fetch } = require('../..')

  async function testAbortedRequest () {
    const controller = new AbortController()

    // Abort the request after 1 second - this should be before
    // any internal timeout expires (undici typically uses 10s+ timeouts)
    setTimeout(() => {
      console.log(`Worker: Aborting request at ${new Date().toISOString()}`)
      controller.abort()
    }, 1000).unref() // unref to not keep process alive

    try {
      console.log(`Worker: Starting fetch to unresponsive host at ${new Date().toISOString()}`)
      await fetch(workerData.url, { signal: controller.signal })
      console.log('Worker: Unexpected - fetch should have been aborted')
    } catch (err) {
      console.log(`Worker: Fetch aborted as expected at ${new Date().toISOString()}:`, err.name)

      // At this point, if the bug exists, internal timers/handles will
      // keep the process alive. If the bug is fixed, the process should
      // be able to exit cleanly.
      console.log('Worker: Request completed, process should be able to exit')

      // Give a small delay to ensure all cleanup is attempted
      await new Promise(resolve => setTimeout(resolve, 100))
      console.log('Worker: Cleanup delay completed')
    }
  }

  testAbortedRequest().catch(console.error)
}
