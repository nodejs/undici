'use strict'

const { createServer } = require('http')

const port = process.env.PORT || '/var/tmp/undici.sock'
const timeout = parseInt(process.env.TIMEOUT, 10) || 1

createServer((req, res) => {
  setTimeout(function () {
    res.end('hello world')
  }, timeout)
}).listen(port)
