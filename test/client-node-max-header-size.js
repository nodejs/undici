const { execSync } = require('node:child_process')
const { test } = require('tap')

const command = 'node -e "require(`./index-fetch`);fetch(`https://httpbin.org/get`)"'

test("respect Node.js' --max-http-header-size", async (t) => {
  t.throws(
    () => execSync(`${command} --max-http-header-size=1`),
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
