'use strict'

const { createServer } = require('http')
const os = require('os')
const path = require('path')

const port = process.env.PORT || path.join(os.tmpdir(), 'undici.sock')
const timeout = parseInt(process.env.TIMEOUT, 10) || 1

createServer((req, res) => {
  setTimeout(function () {
    res.end('hello world')
  }, timeout)
}).listen(port)
