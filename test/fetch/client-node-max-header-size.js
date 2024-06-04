'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { exec } = require('node:child_process')
const { test } = require('node:test')

const command = 'node -e "require(\'./undici-fetch.js\').fetch(\'https://httpbin.org/get\')"'

test("respect Node.js' --max-http-header-size", async (t) => {
  t = tspl(t, { plan: 6 })

  exec(`${command} --max-http-header-size=1`, { stdio: 'pipe' }, (err, stdout, stderr) => {
    t.strictEqual(err.code, 1)
    t.strictEqual(stdout, '')
    t.match(stderr, /UND_ERR_HEADERS_OVERFLOW/, '--max-http-header-size=1 should throw')
  })

  exec(command, { stdio: 'pipe' }, (err, stdout, stderr) => {
    t.ifError(err)
    t.strictEqual(stdout, '')
    t.strictEqual(stderr, '', 'default max-http-header-size should not throw')
  })

  await t.completed
})
