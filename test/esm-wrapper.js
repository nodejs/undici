'use strict'
const { nodeMajor, nodeMinor } = require('../lib/core/util')

if (!((nodeMajor > 14 || (nodeMajor === 14 && nodeMajor > 13)) || (nodeMajor === 12 && nodeMinor > 20))) {
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
