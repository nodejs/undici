'use strict'
const { PassThrough } = require('stream')
const http = require('http')
const Benchmark = require('benchmark')
const undici = require('..')

// # Start the h2o server (in h2o repository)
// # Then change the port below to 8080
// h2o -c examples/h2o/h2o.conf
//
// # Alternatively start the Node.js server
// node benchmarks/server.js
//
// # Start the benchmarks
// node benchmarks/index.js

const httpOptions = {
  protocol: 'http:',
  hostname: 'localhost',
  method: 'GET',
  path: '/',
  port: 3000,
  agent: new http.Agent({ keepAlive: true })
}

const undiciOptions = {
  path: '/',
  method: 'GET'
}

const pool = undici(`http://${httpOptions.hostname}:${httpOptions.port}`, {
  connections: 100,
  pipelining: 10
})

const suite = new Benchmark.Suite()

suite.add('undici - request - pipe', {
  defer: true,
  fn: deferred => {
    pool.request(undiciOptions, (error, { body }) => {
      if (error) {
        throw error
      }

      const stream = new PassThrough()
      stream.once('finish', () => {
        deferred.resolve()
      })

      body.pipe(stream)
    })
  }
}).add('undici - stream - pipe', {
  defer: true,
  fn: deferred => {
    pool.stream(undiciOptions, () => {
      const stream = new PassThrough()
      stream.once('finish', () => {
        deferred.resolve()
      })

      return stream
    }, error => {
      if (error) {
        throw error
      }
    })
  }
}).add('http - keepalive - pipe', {
  defer: true,
  fn: deferred => {
    http.get(httpOptions, response => {
      const stream = new PassThrough()
      stream.once('finish', () => {
        deferred.resolve()
      })

      response.pipe(stream)
    })
  }
}).on('cycle', event => {
  console.log(String(event.target))
}).run()
