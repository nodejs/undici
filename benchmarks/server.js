'use strict'

const { createServer } = require('http')

createServer((req, res) => {
  res.end('hello world')
}).listen('/var/tmp/undici.sock')
