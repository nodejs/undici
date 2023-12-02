'use strict'

const { execSync } = require('node:child_process')
const { test } = require('tap')

const command = 'node -e "require(\'./undici-fetch.js\').fetch(\'https://httpbin.org/get\')"'

test("respect Node.js' --max-http-header-size", async (t) => {
  t.throws(
    // TODO: Drop the `--unhandled-rejections=throw` once we drop Node.js 14
    () => execSync(`${command} --max-http-header-size=1 --unhandled-rejections=throw`),
    /UND_ERR_HEADERS_OVERFLOW/,
    'max-http-header-size=1 should throw'
  )

  t.doesNotThrow(
    () => execSync(command),
    /UND_ERR_HEADERS_OVERFLOW/,
    'default max-http-header-size should not throw'
  )

  t.end()
})
