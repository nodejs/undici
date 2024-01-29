'use strict'

const { unlinkSync, readFileSync } = require('node:fs')
const { createServer } = require('node:https')
const os = require('node:os')
const path = require('node:path')
const cluster = require('node:cluster')

const key = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'cert.pem'), 'utf8')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

const port = process.env.PORT || socketPath
const timeout = parseInt(process.env.TIMEOUT, 10) || 1
const workers = parseInt(process.env.WORKERS) || os.cpus().length

if (cluster.isPrimary) {
  try {
    unlinkSync(socketPath)
  } catch (_) {
    // Do nothing if the socket does not exist
  }

  for (let i = 0; i < workers; i++) {
    cluster.fork()
  }
} else {
  const buf = Buffer.alloc(64 * 1024, '_')
  const server = createServer({
    key,
    cert,
    keepAliveTimeout: 600e3
  }, (req, res) => {
    setTimeout(() => {
      res.end(buf)
    }, timeout)
  })

  server.listen(port)
}
