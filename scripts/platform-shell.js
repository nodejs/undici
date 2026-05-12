'use strict'

const { platform } = require('node:os')
const { writeFileSync } = require('node:fs')
const { resolve } = require('node:path')

if (platform() === 'win32') {
  const shouldRetryTests = process.env.GITHUB_ACTIONS === 'true' && process.versions.node.split('.')[0] === '24'
  const scriptShell = shouldRetryTests
    ? resolve(__dirname, 'retry-test-shell.cmd')
    : 'C:\\windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

  writeFileSync(
    resolve(__dirname, shouldRetryTests ? '..' : '.', '.npmrc'),
    `script-shell = ${scriptShell}\n`
  )
}
