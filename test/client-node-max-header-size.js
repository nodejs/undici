'use strict'

const { execSync } = require('node:child_process')
const { throws, doesNotThrow } = require('node:assert')
const { test } = require('node:test')

const command = 'node -e "require(\'.\').request(\'https://httpbin.org/get\')"'

test("respect Node.js' --max-http-header-size", () => {
  throws(
    () => execSync(`${command} --max-http-header-size=1`, { stdio: 'pipe' }),
    /UND_ERR_HEADERS_OVERFLOW/,
    'max-http-header-size=1 should throw'
  )

  doesNotThrow(
    () => execSync(command),
    /UND_ERR_HEADERS_OVERFLOW/,
    'default max-http-header-size should not throw'
  )
})
