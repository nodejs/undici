'use strict'

;(async () => {
  try {
    await import('./esm-wrapper.mjs')
  } catch (e) {
    if (e.message === 'Not supported') {
      require('tap') // shows skipped
      return
    }
    console.error(e.stack)
    process.exitCode = 1
  }
})()
