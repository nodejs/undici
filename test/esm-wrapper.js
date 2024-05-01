'use strict'

;(async () => {
  try {
    await import('./utils/esm-wrapper.mjs')
  } catch (e) {
    if (e.message === 'Not supported') {
      require('node:test') // shows skipped
      return
    }
    console.error(e.stack)
    process.exitCode = 1
  }
})()
