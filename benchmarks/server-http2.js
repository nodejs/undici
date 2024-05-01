'use strict'

const { unlinkSync, readFileSync } = require('node:fs')
const { createSecureServer } = require('node:http2')
const os = require('node:os')
const path = require('node:path')
const cluster = require('node:cluster')

const key = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'key.pem'), 'utf8')
const cert = readFileSync(path.join(__dirname, '..', 'test', 'fixtures', 'cert.pem'), 'utf8')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

const port = process.env.PORT || socketPath
const timeout = parseInt(process.env.TIMEOUT, 10) || 1
const workers = parseInt(process.env.WORKERS) || os.cpus().length

const sessionTimeout = 600e3 // 10 minutes

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
  const server = createSecureServer(
    {
      key,
      cert,
      allowHTTP1: true,
      sessionTimeout
    }
  )

  server.on('stream', (stream) => {
    setTimeout(() => {
      stream.respond({
        'content-type': 'text/plain; charset=utf-8',
        ':status': 200
      })

      stream.setEncoding('utf-8').end(buf)
    }, timeout)
  })

  server.keepAliveTimeout = 600e3

  server.listen(port)
}
