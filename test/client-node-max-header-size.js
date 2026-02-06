'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { once } = require('node:events')
const { exec } = require('node:child_process')
const { test, before, after, describe } = require('node:test')
const { createServer } = require('node:http')

describe("Node.js' --max-http-header-size cli option", () => {
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

  after(() => {
    server.closeAllConnections?.()
    server.close()
  })

  test("respect Node.js' --max-http-header-size", async (t) => {
    t = tspl(t, { plan: 6 })
    const command = 'node --disable-warning=ExperimentalWarning -e "require(\'.\').request(\'http://localhost:' + server.address().port + '\')"'

    exec(`${command} --max-http-header-size=1`, { stdio: 'pipe' }, (err, stdout, stderr) => {
      t.strictEqual(err.code, 1)
      t.strictEqual(stdout, '')
      t.match(stderr, /UND_ERR_HEADERS_OVERFLOW/, '--max-http-header-size=1 should throw')
    })

    exec(command, { stdio: 'pipe' }, (err, stdout, stderr) => {
      t.ifError(err)
      t.strictEqual(stdout, '')
      // Filter out debugger messages that may appear when running with --inspect
      const filteredStderr = stderr.replace(/Debugger listening on ws:\/\/.*?\n/g, '')
        .replace(/For help, see:.*?\n/g, '')
        .replace(/Debugger attached\.\n/g, '')
        .replace(/Waiting for the debugger to disconnect\.\.\.\n/g, '')
      t.strictEqual(filteredStderr, '', 'default max-http-header-size should not throw')
    })

    await t.completed
  })

  test('--max-http-header-size with Client API', async (t) => {
    t = tspl(t, { plan: 6 })
    const command = 'node --disable-warning=ExperimentalWarning -e "new (require(\'.\').Client)(new URL(\'http://localhost:200\'))"'

    exec(`${command} --max-http-header-size=0`, { stdio: 'pipe' }, (err, stdout, stderr) => {
      t.strictEqual(err.code, 1)
      t.strictEqual(stdout, '')
      t.match(stderr, /http module not available or http.maxHeaderSize invalid/, '--max-http-header-size=0 should result in an Error when using the Client API')
    })

    exec(command, { stdio: 'pipe' }, (err, stdout, stderr) => {
      t.ifError(err)
      t.strictEqual(stdout, '')
      // Filter out debugger messages that may appear when running with --inspect
      const filteredStderr = stderr.replace(/Debugger listening on ws:\/\/.*?\n/g, '')
        .replace(/For help, see:.*?\n/g, '')
        .replace(/Debugger attached\.\n/g, '')
        .replace(/Waiting for the debugger to disconnect\.\.\.\n/g, '')
      t.strictEqual(filteredStderr, '', 'default max-http-header-size should not throw')
    })

    await t.completed
  })
})
