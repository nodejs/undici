'use strict'

const { createServer } = require('http')
const cluster = require('cluster')
const numCPUs = require('os').cpus().length

if (cluster.isMaster) {
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork()
  }
} else {
  createServer((req, res) => {
    res.end('hello world')
  }).listen(3009)
}
