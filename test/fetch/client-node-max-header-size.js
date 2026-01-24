'use strict'

const { exec } = require('node:child_process')
const { once } = require('node:events')
const { createServer } = require('node:http')
const { test, describe, before, after } = require('node:test')

describe('fetch respects --max-http-header-size', () => {
  let server

  before(async () => {
    server = createServer({ joinDuplicateHeaders: true }, (req, res) => {
      res.writeHead(200, 'OK', {
        'Content-Length': 2
      })
      res.write('OK')
      res.end()
    }).listen(0)

    await once(server, 'listening')
  })

  after(async () => {
    server.closeAllConnections?.()
    await new Promise(resolve => server.close(resolve))
  })

  test("respect Node.js' --max-http-header-size", (t, done) => {
    t.plan(6)

    const command = 'node -e "require(\'./undici-fetch.js\').fetch(\'http://localhost:' + server.address().port + '\')"'

    exec(`${command} --max-http-header-size=1`, { stdio: 'pipe' }, (err, stdout, stderr) => {
      t.assert.strictEqual(err.code, 1)
      t.assert.strictEqual(stdout, '')
      t.assert.match(stderr, /UND_ERR_HEADERS_OVERFLOW/, '--max-http-header-size=1 should throw')

      exec(command, { stdio: 'pipe' }, (err, stdout, stderr) => {
        t.assert.ifError(err)
        t.assert.strictEqual(stdout, '')
        t.assert.strictEqual(stderr, '', 'default max-http-header-size should not throw')

        done()
      })
    })
  })
})
