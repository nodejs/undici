'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { exec } = require('node:child_process')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, describe, before, after } = require('node:test')

describe('fetch respects --max-http-header-size', () => {
  let server

  before(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, 'OK', {
        'Content-Length': 2
      })
      res.write('OK')
      res.end()
    }).listen(0)

    await once(server, 'listening')
  })

  after(() => server.close())

  test("respect Node.js' --max-http-header-size", async (t) => {
    t = tspl(t, { plan: 6 })

    const command = 'node -e "require(\'./undici-fetch.js\').fetch(\'http://localhost:' + server.address().port + '\')"'

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
})
