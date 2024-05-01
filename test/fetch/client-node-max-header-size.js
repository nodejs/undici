'use strict'

const { execSync } = require('node:child_process')
const { test } = require('node:test')
const assert = require('node:assert')

const command = 'node -e "require(\'./undici-fetch.js\').fetch(\'https://httpbin.org/get\')"'

test("respect Node.js' --max-http-header-size", async () => {
  assert.throws(
    () => execSync(`${command} --max-http-header-size=1`),
    /UND_ERR_HEADERS_OVERFLOW/,
    'max-http-header-size=1 should throw'
  )

  assert.doesNotThrow(
    () => execSync(command),
    /UND_ERR_HEADERS_OVERFLOW/,
    'default max-http-header-size should not throw'
  )
})
