'use strict'

const { unlinkSync } = require('fs')
const { createServer } = require('http')
const os = require('os')
const path = require('path')

const socketPath = path.join(os.tmpdir(), 'undici.sock')

try {
  unlinkSync(socketPath)
} catch (_) {
  // Do not nothing if the socket does not exist
}

const port = process.env.PORT || socketPath
const timeout = parseInt(process.env.TIMEOUT, 10) || 1

createServer((req, res) => {
  setTimeout(function () {
    res.end('hello world')
  }, timeout)
}).listen(port)
