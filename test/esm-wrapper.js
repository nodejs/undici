'use strict'
const semver = require('semver')

if (!semver.satisfies(process.version, '>= v14.13.0 || ^12.20.0')) {
  require('tap') // shows skipped
} else {
  ;(async () => {
    try {
      await import('./utils/esm-wrapper.mjs')
    } catch (e) {
      if (e.message === 'Not supported') {
        require('tap') // shows skipped
        return
      }
      console.error(e.stack)
      process.exitCode = 1
    }
  })()
}
