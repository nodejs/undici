'use strict'

const { unlinkSync } = require('node:fs')
const { createServer } = require('node:http')
const os = require('node:os')
const path = require('node:path')
const cluster = require('node:cluster')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

const port = process.env.PORT || socketPath
const timeout = Number.isNaN(parseInt(process.env.TIMEOUT, 10)) ? 1 : parseInt(process.env.TIMEOUT, 10)
const workers = parseInt(process.env.WORKERS) || os.cpus().length
const bodySize = parseInt(process.env.BODY_SIZE, 10) || 64 * 1024

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
  const buf = Buffer.alloc(bodySize, '_')

  const headers = {
    'Content-Length': `${buf.byteLength}`,
    'Content-Type': 'text/plain; charset=UTF-8'
  }
  let i = 0
  const server = createServer((_req, res) => {
    i++
    if (timeout === 0) {
      res.writeHead(200, headers)
      res.end(buf)
      return
    }
    setTimeout(() => {
      res.writeHead(200, headers)
      res.end(buf)
    }, timeout)
  }).listen(port)
  server.keepAliveTimeout = 600e3
  setInterval(() => {
    console.log(`Worker ${process.pid} processed ${i} requests`)
  }, 5000)
}
